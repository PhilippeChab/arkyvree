import { getTableName } from "drizzle-orm";

import { charactersInCharacter, playerCharactersInCampaign } from "@/drizzle/schema.ts";
import { addJob, db, withTransaction } from "@/server/database/index.ts";
import { pingWorker } from "@/server/queue.ts";
import {
  Activities,
  Campaigns,
  Characters,
  Exports,
  PlayerCharacters,
  Visibility,
} from "@/server/repositories/index.ts";
import { toExportJobKey } from "@/server/services/exports/index.ts";
import { CampaignsPolicy } from "@/server/services/policies/index.ts";
import { formatSheetFileName } from "@/shared/exports.ts";
import type { Character, Session } from "@/shared/relations.ts";

import { findEditableCharacterOrBonded } from "./editableCharacter.ts";

/**
 * How long a queued export waits for its file before the daily cleanup reaps it: far past the worker's run, which
 * keeps a ready file an hour.
 */
const PENDING_EXPORT_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * Where a PDF export's activity and failure notification link to: the
 * character page, or for an export requested from a campaign the campaign
 * character page (a Game Master can't open the character page itself).
 */
export function getCharacterPdfTargetTable(campaignId?: string) {
  return getTableName(campaignId ? playerCharactersInCampaign : charactersInCharacter);
}

/**
 * Queues a PDF of the character for the session user, who is notified when it
 * is ready, and answers its export, pending: its id says whether it's ready
 * (`ExportsService.getExportStatus`), which the worker fills in. Callers check
 * access with `findExportableCharacter`, passing the same `campaignId` so the
 * worker repeats that check.
 */
export async function enqueueCharacterPdf(
  session: Session,
  characterRecord: Pick<Character, "id" | "name">,
  campaignId?: string,
) {
  const pending = await withTransaction(async (tx) => {
    const [exportRecord] = await Exports.create(tx, {
      userId: session.userId,
      type: "pdf",
      mimeType: "application/pdf",
      fileName: formatSheetFileName(characterRecord.name),
      status: "pending",
      expiresAt: new Date(Date.now() + PENDING_EXPORT_TTL_MS).toISOString(),
    });

    await addJob(
      tx,
      "generatePdf",
      {
        userId: session.userId,
        characterId: characterRecord.id,
        characterName: characterRecord.name,
        campaignId,
        exportId: exportRecord.id,
      },
      { jobKey: toExportJobKey(exportRecord.id), maxAttempts: 2, queueName: `pdf-${session.userId}` },
    );

    await Activities.create(tx, {
      userId: session.userId,
      targetId: characterRecord.id,
      targetTable: getCharacterPdfTargetTable(campaignId),
      type: "generatePdf",
    });

    return exportRecord;
  });

  pingWorker();
  return pending;
}

/**
 * The character `userId` may export as a PDF, or null: one they own or
 * contribute to (or a bonded character of such a master). Through
 * `campaignId`, the character must be linked to that campaign, and its Game
 * Master may export it too. Checked when the export is queued and again when
 * the worker runs it, so access revoked in between is honored.
 */
export async function findExportableCharacter(userId: string, characterId: string, campaignId?: string) {
  if (campaignId) {
    if (!(await PlayerCharacters.findOne(db, { characterId, campaignId }))) return null;
    const campaign = await Campaigns.findOne(db, { id: campaignId }, Visibility.All);
    if (campaign && (await CampaignsPolicy.for(db, { userId }, campaign)).isGameMaster())
      return (await Characters.findOne(db, { id: characterId })) ?? null;
  }
  return findEditableCharacterOrBonded(db, characterId, userId);
}
