import { pdf } from "@react-pdf/renderer";
import type { JobHelpers } from "graphile-worker";

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
import { publishWsEvent } from "@/server/websockets/index.ts";
import { formatSheetFileName } from "@/shared/exports.ts";

interface GeneratePdfPayload {
  /** Set when a Game Master exports a character of their campaign. */
  campaignId?: string;
  characterId: string;
  characterName: string;
  userId: string;
}

const MAX_PDF_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB
const ONE_HOUR_MS = 60 * 60 * 1000;

export async function generatePdfTask(payload: unknown, helpers: JobHelpers): Promise<void> {
  const { userId, characterId, characterName, campaignId } = payload as GeneratePdfPayload;

  helpers.logger.info(`Generating PDF for character ${characterId}`);

  try {
    // Access may have been revoked since the export was queued.
    const characterRecord = await findExportableCharacter(userId, characterId, campaignId);

    if (!characterRecord) {
      helpers.logger.warn(`Character ${characterId} not found or not exportable for user ${userId}`);
      await withTransaction((tx) =>
        Notifications.create(tx, {
          recipientId: userId,
          actorId: userId,
          type: "pdfFailed",
          targetId: characterId,
          targetTable: getCharacterPdfTargetTable(campaignId),
          data: { characterName },
        }),
      );
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
    const expiresAt = new Date(Date.now() + ONE_HOUR_MS).toISOString();

    const exportId = await withTransaction(async (tx) => {
      const [exportRecord] = await Exports.create(tx, {
        userId,
        type: "pdf",
        mimeType: "application/pdf",
        fileName,
        data: pdfBuffer,
        expiresAt,
      });

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
        await withTransaction((tx) =>
          Notifications.create(tx, {
            recipientId: userId,
            actorId: userId,
            type: "pdfFailed",
            targetId: characterId,
            targetTable: getCharacterPdfTargetTable(campaignId),
            data: { characterName },
          }),
        );
        await publishWsEvent(userId, { type: "notifications:updated" });
      } catch {
        // Best-effort failure notification
      }
    }

    throw error;
  }
}
