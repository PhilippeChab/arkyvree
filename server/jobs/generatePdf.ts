import { pdf } from "@react-pdf/renderer";
import type { JobHelpers } from "graphile-worker";

import type { Db } from "@/drizzle/database.ts";
import { Engine } from "@/engine/index.ts";
import { withRulesetScope } from "@/server/cow/index.ts";
import { db, withTransaction } from "@/server/database/index.ts";
import { isProduction } from "@/server/environment.ts";
import { Exports, Notifications } from "@/server/repositories/index.ts";
import { getSlotUrl } from "@/server/services/attachments/index.ts";
import {
  findExportableCharacter,
  getCharacterPdfTargetTable,
  readCharacterInput,
} from "@/server/services/characters/index.ts";
import { READY_EXPORT_TTL_MS } from "@/server/services/exports/index.ts";
import { publishWsEvent } from "@/server/websockets/index.ts";
import { formatSheetFileName } from "@/shared/exports.ts";

interface GeneratePdfPayload {
  /** Set when a Game Master exports a character of their campaign. */
  campaignId?: string;
  characterId: string;
  characterName: string;
  /** The export its request stored, pending, which the job fills in or marks failed: none on a job queued before. */
  exportId?: string;
  userId: string;
}

const MAX_PDF_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

/**
 * The user's PDF failed: its export marked so, and the user told. An export an earlier attempt stored stays ready, and
 * its user, told it's ready, isn't told it failed. (An attempt can store it and die before the worker records it done.)
 */
async function failExport({ campaignId, characterId, characterName, exportId, userId }: GeneratePdfPayload) {
  await withTransaction(async (tx) => {
    const [failed] = exportId
      ? await Exports.update(tx, { status: "failed" }, { id: exportId, status: "pending" })
      : [];
    // One an earlier attempt stored stays as it is; of one the cleanup deleted (its pending day past) the user hears,
    // the notification naming no export
    if (exportId && !failed && (await Exports.findStatus(tx, { id: exportId, userId }))) return;
    await Notifications.create(tx, {
      recipientId: userId,
      actorId: userId,
      type: "pdfFailed",
      targetId: characterId,
      targetTable: getCharacterPdfTargetTable(campaignId),
      data: { characterName, ...(failed && { exportId: failed.id }) },
    });
  });
}

/**
 * The character's PDF file stored in its export, ready for an hour: the one its request stored, or a new one (a job
 * queued before exports were stored pending, or a pending one the cleanup reaped, kept by its id).
 */
async function storeExport(tx: Db, { exportId, userId }: GeneratePdfPayload, data: Buffer, fileName: string) {
  const file = {
    data,
    fileName,
    expiresAt: new Date(Date.now() + READY_EXPORT_TTL_MS).toISOString(),
    status: "ready" as const,
  };
  const [stored] = exportId ? await Exports.update(tx, file, { id: exportId }) : [];
  if (stored) return stored;
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
  const job = payload as GeneratePdfPayload;
  const { userId, characterId, characterName, campaignId } = job;

  helpers.logger.info(`Generating PDF for character ${characterId}`);

  try {
    // Access may have been revoked since the export was queued.
    const characterRecord = await findExportableCharacter(userId, characterId, campaignId);

    if (!characterRecord) {
      helpers.logger.warn(`Character ${characterId} not found or not exportable for user ${userId}`);
      await failExport(job);
      await publishWsEvent(userId, { type: "notifications:updated" }).catch((err) =>
        helpers.logger.warn(`Failed to publish PDF failure notification: ${err}`),
      );
      return;
    }

    const portraitUrl = await getSlotUrl("portrait", characterRecord.id);
    const sheet = await withRulesetScope(db, characterRecord.rulesetId, async (scope) =>
      Engine.for(scope)
        .character(await readCharacterInput(db, characterRecord))
        .describeSheet({
          diagnostics: !isProduction(),
          portraitUrl,
        }),
    );

    const pdfBlob = await pdf(sheet).toBlob();

    const arrayBuffer = await pdfBlob.arrayBuffer();
    if (arrayBuffer.byteLength > MAX_PDF_SIZE_BYTES) {
      throw new Error(
        `PDF too large (${Math.round(arrayBuffer.byteLength / 1024 / 1024)}MB), max ${MAX_PDF_SIZE_BYTES / 1024 / 1024}MB`,
      );
    }
    const pdfBuffer = Buffer.from(arrayBuffer);

    const fileName = formatSheetFileName(characterName);

    const exportId = await withTransaction(async (tx) => {
      const exportRecord = await storeExport(tx, job, pdfBuffer, fileName);

      await Notifications.create(tx, {
        recipientId: userId,
        actorId: userId,
        type: "pdfReady",
        targetId: exportRecord.id,
        targetTable: "exports",
        data: {
          characterName,
          characterId,
          exportId: exportRecord.id,
          fileName,
        },
      });

      return exportRecord.id;
    });

    await publishWsEvent(userId, { type: "notifications:updated" }).catch((err) =>
      helpers.logger.warn(`Failed to publish PDF ready notification: ${err}`),
    );

    helpers.logger.info(`PDF stored as export ${exportId} for character ${characterId}`);
  } catch (error) {
    helpers.logger.error(`PDF generation failed for character ${characterId}: ${error}`);

    if (helpers.job.attempts >= helpers.job.max_attempts) {
      try {
        await failExport(job);
        await publishWsEvent(userId, { type: "notifications:updated" });
      } catch {
        // Best-effort failure notification
      }
    }

    throw error;
  }
}
