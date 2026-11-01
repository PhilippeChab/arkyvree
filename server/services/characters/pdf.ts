import { addJob, db, withTransaction } from "@/server/database/index.ts";
import { pingWorker } from "@/server/queue.ts";
import { Activities, Characters, PlayerCharacters } from "@/server/repositories/index.ts";
import { findReadableCampaign } from "@/server/services/campaigns/index.ts";
import { CharactersPolicy, isAllowed } from "@/server/services/policies/index.ts";
import { TARGET_TYPES } from "@/shared/activityTargets.ts";
import type { Character, Session } from "@/shared/relations.ts";

/**
 * Where a PDF export's activity and failure notification link to: the
 * character page, or for an export requested from a campaign the campaign
 * character page (a Game Master can't open the character page itself).
 */
export function getCharacterPdfTargetType(campaignId?: string) {
  return campaignId ? TARGET_TYPES.playerCharacters : TARGET_TYPES.characters;
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
      targetType: getCharacterPdfTargetType(campaignId),
      type: "generatePdf",
    });
  });

  pingWorker();
}

/**
 * The character `userId` may export as a PDF, or null: as its policy says (`CharactersPolicy.canExport`: its editors,
 * while they may edit it). Through `campaignId`, the character must be linked to that campaign, which they may read
 * (`findReadableCampaign`: a member), and the campaign's policy says (`CampaignsPolicy.canExportCharacter`: its Game
 * Master too). Checked when the export is queued and again when the worker runs it, so access revoked in between is
 * honored.
 */
export async function findExportableCharacter(userId: string, characterId: string, campaignId?: string) {
  const character = await Characters.findOne(db, { id: characterId });
  if (!character) return null;
  const policy = await CharactersPolicy.for(db, { userId }, character);
  if (!campaignId) return isAllowed(() => policy.canExport()) ? character : null;

  if (!(await PlayerCharacters.findOne(db, { characterId, campaignId }))) return null;
  const readable = await findReadableCampaign(db, { userId }, campaignId);
  return readable && isAllowed(() => readable.policy.canExportCharacter(policy)) ? character : null;
}
