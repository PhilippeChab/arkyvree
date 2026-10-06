import { pdf } from "@react-pdf/renderer";
import type { JobHelpers } from "graphile-worker";

import { withTransaction } from "@/server/database/index.ts";
import { Exports, Notifications } from "@/server/repositories/index.ts";
import type { CharacterKind } from "@/server/rulesets/engine/types.ts";
import { RulesetFactory } from "@/server/rulesets/RulesetFactory.ts";
import { getSlotUrl } from "@/server/services/attachments/index.ts";
import { findExportableCharacter, getCharacterPdfTargetTable } from "@/server/services/characters/index.ts";
import { publishWsEvent } from "@/server/websockets/index.ts";

interface GeneratePdfPayload {
  userId: string;
  characterId: string;
  characterName: string;
  /** Set when a Game Master exports a character of their campaign. */
  campaignId?: string;
}

const MAX_PDF_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB
const ONE_HOUR_MS = 60 * 60 * 1000;

function sanitizeFileName(name: string): string {
  return name.replace(/[/\\?%*:|"<>]/g, "_").slice(0, 200);
}

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

    const rulesetModule = await RulesetFactory.fromRulesetId(characterRecord.rulesetId);
    const kind = characterRecord.kind as CharacterKind;
    const { detailedCharacter, CharacterSheetComponent } = await rulesetModule.createDetailedCharacterWithSheet(
      characterRecord,
      kind,
    );

    const portraitUrl = await getSlotUrl("Character", characterRecord.id, "portrait");

    const pdfBlob = await pdf(
      <CharacterSheetComponent detailedCharacter={detailedCharacter} kind={kind} portraitUrl={portraitUrl} />,
    ).toBlob();

    const arrayBuffer = await pdfBlob.arrayBuffer();
    if (arrayBuffer.byteLength > MAX_PDF_SIZE_BYTES) {
      throw new Error(
        `PDF too large (${Math.round(arrayBuffer.byteLength / 1024 / 1024)}MB), max ${MAX_PDF_SIZE_BYTES / 1024 / 1024}MB`,
      );
    }
    const pdfBuffer = Buffer.from(arrayBuffer);

    const fileName = `${sanitizeFileName(characterName)}-sheet.pdf`;
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
