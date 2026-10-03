import { getTableName } from "drizzle-orm";

import { charactersInCharacter, playerCharactersInCampaign } from "@/drizzle/schema.ts";
import { db, withTransaction } from "@/server/database/index.ts";
import { addJob, pingWorker } from "@/server/queue.ts";
import { Activities, Characters, PlayerCharacters } from "@/server/repositories/index.ts";
import { CampaignsPolicy } from "@/server/services/policies/index.ts";
import type { Character, Session } from "@/shared/relations.ts";

import { findEditableCharacterOrBonded } from "./editableCharacter.ts";

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
    if (await CampaignsPolicy.isGameMaster(userId, campaignId)) {
      return (await Characters.findOne(db, { id: characterId })) ?? null;
    }
  }
  return findEditableCharacterOrBonded(db, characterId, userId);
}

/**
 * Where a PDF export's activity and failure notification link to: the
 * character page, or for an export requested from a campaign the campaign
 * character page (a Game Master can't open the character page itself).
 */
export function characterPdfTargetTable(campaignId?: string) {
  return getTableName(campaignId ? playerCharactersInCampaign : charactersInCharacter);
}

/**
 * Queues a PDF of the character for the session user, who is notified when it
 * is ready. Callers check access with `findExportableCharacter`, passing the
 * same `campaignId` so the worker repeats that check.
 */
export async function enqueueCharacterPdf(
  session: Session,
  characterRecord: Pick<Character, "id" | "name">,
  campaignId?: string,
) {
  await withTransaction(async (tx) => {
    await addJob(
      tx,
      "generatePdf",
      { userId: session.userId, characterId: characterRecord.id, characterName: characterRecord.name, campaignId },
      { maxAttempts: 2, queueName: `pdf-${session.userId}` },
    );

    await Activities.create(tx, {
      userId: session.userId,
      targetId: characterRecord.id,
      targetTable: characterPdfTargetTable(campaignId),
      type: "generatePdf",
    });
  });

  pingWorker();
}
