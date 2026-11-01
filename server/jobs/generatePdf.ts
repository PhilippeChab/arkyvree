import type { JobHelpers } from "graphile-worker";

import type { Db } from "@/drizzle/database.ts";
import { db, withTransaction } from "@/server/database/index.ts";
import { Exports, Notifications } from "@/server/repositories/index.ts";
import {
  findExportableCharacter,
  getCharacterPdfTargetType,
  renderCharacterSheet,
} from "@/server/services/characters/index.ts";
import { READY_EXPORT_TTL_MS } from "@/server/services/exports/index.ts";
import { publishWsEvent } from "@/server/websockets/index.ts";
import { TARGET_TYPES } from "@/shared/activityTargets.ts";

interface GeneratePdfPayload {
  /** Set when the export is requested from a campaign: by its Game Master, or by a member who edits the character. */
  campaignId?: string;
  characterId: string;
  characterName: string;
  /** The export its request stored, pending, which the job fills in or marks failed: none on a job queued before. */
  exportId?: string;
  userId: string;
}

/**
 * Tells the user their export failed: its export marked so, a notification, and the event that refreshes it (a failed
 * publish is logged). An export an earlier attempt stored stays ready, and its user, told it's ready, isn't told it
 * failed (an attempt can store it and die before the worker records it done).
 */
async function notifyPdfFailed(payload: GeneratePdfPayload, helpers: JobHelpers) {
  const { userId, characterId, characterName, campaignId, exportId } = payload;
  const notified = await withTransaction(async (tx) => {
    const [failed] = exportId
      ? await Exports.update(tx, { status: "failed" }, { id: exportId, status: ["pending", "failed"] })
      : [];
    // One an earlier attempt stored stays as it is; of one the cleanup deleted the user hears, naming no export
    if (exportId && !failed && (await Exports.findStatus(tx, { id: exportId, userId }))) return false;
    await Notifications.create(tx, {
      recipientId: userId,
      actorId: userId,
      type: "pdfFailed",
      targetId: characterId,
      targetType: getCharacterPdfTargetType(campaignId),
      data: { characterName, ...(failed && { exportId: failed.id }) },
    });
    return true;
  });
  if (!notified) return;
  await publishWsEvent(userId, { type: "notifications:updated" }).catch((error) =>
    helpers.logger.warn(`Failed to publish PDF failure notification: ${error}`),
  );
}

/**
 * The character's PDF file stored in its export, ready for an hour: the one its request stored while it's pending or
 * failed, or a new one (a job queued before exports were stored pending, or a pending one the cleanup reaped, kept by
 * its id). None for one an earlier attempt stored.
 */
async function storeExport(tx: Db, { exportId, userId }: GeneratePdfPayload, data: Buffer, fileName: string) {
  const file = {
    data,
    fileName,
    expiresAt: new Date(Date.now() + READY_EXPORT_TTL_MS).toISOString(),
    status: "ready" as const,
  };
  const [stored] = exportId ? await Exports.update(tx, file, { id: exportId, status: ["pending", "failed"] }) : [];
  if (stored) return stored;
  if (exportId && (await Exports.findStatus(tx, { id: exportId, userId }))) return null;
  const [created] = await Exports.create(tx, {
    ...file,
    id: exportId,
    userId,
    type: "pdf",
    mimeType: "application/pdf",
  });
  return created;
}

export async function generatePdfTask(payload: unknown, helpers: JobHelpers): Promise<void> {
  const request = payload as GeneratePdfPayload;
  const { userId, characterId, characterName, campaignId } = request;

  try {
    // An export ready has its answer, which its user was told: a retry of an attempt that stored the PDF and died
    // before the worker recorded it done
    const status = request.exportId
      ? (await Exports.findStatus(db, { id: request.exportId, userId }))?.status
      : undefined;
    if (status === "ready") {
      helpers.logger.info(`PDF for character ${characterId} not made: its export ${request.exportId} is ${status}`);
      return;
    }

    helpers.logger.info(`Generating PDF for character ${characterId}`);

    // Access may have been revoked since the export was queued.
    const characterRecord = await findExportableCharacter(userId, characterId, campaignId);

    if (!characterRecord) {
      helpers.logger.warn(`Character ${characterId} not found or not exportable for user ${userId}`);
      await notifyPdfFailed(request, helpers);
      return;
    }

    // Its exporters read its private notes: its editors, and its campaign's Game Master
    const { data, fileName } = await renderCharacterSheet(characterRecord, "show");

    const exportId = await withTransaction(async (tx) => {
      const exportRecord = await storeExport(tx, request, data, fileName);
      if (!exportRecord) return null;

      await Notifications.create(tx, {
        recipientId: userId,
        actorId: userId,
        type: "pdfReady",
        targetId: exportRecord.id,
        targetType: TARGET_TYPES.exports,
        data: {
          characterName,
          characterId,
          exportId: exportRecord.id,
          fileName,
        },
      });

      return exportRecord.id;
    });

    if (!exportId) {
      helpers.logger.warn(`PDF for character ${characterId} not stored: its export ${request.exportId} is ready`);
      return;
    }

    await publishWsEvent(userId, { type: "notifications:updated" }).catch((err) =>
      helpers.logger.warn(`Failed to publish PDF ready notification: ${err}`),
    );

    helpers.logger.info(`PDF stored as export ${exportId} for character ${characterId}`);
  } catch (error) {
    helpers.logger.error(`PDF generation failed for character ${characterId}: ${error}`);

    if (helpers.job.attempts >= helpers.job.max_attempts) {
      try {
        await notifyPdfFailed(request, helpers);
      } catch {
        // Best-effort failure notification
      }
    }

    throw error;
  }
}
