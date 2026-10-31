import { addJob, db, withTransaction } from "@/server/database/index.ts";
import { pingWorker } from "@/server/queue.ts";
import { Activities, Characters, Exports, PlayerCharacters } from "@/server/repositories/index.ts";
import { findReadableCampaign } from "@/server/services/campaigns/index.ts";
import { PENDING_EXPORT_TTL_MS, toExportJobKey } from "@/server/services/exports/index.ts";
import { TARGET_TYPES } from "@/shared/activityTargets.ts";
import { formatSheetFileName } from "@/shared/exports.ts";
import type { Character, Session } from "@/shared/relations.ts";

import { findEditableCharacterOrChild } from "./editableCharacter.ts";

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
      targetType: getCharacterPdfTargetType(campaignId),
      type: "generatePdf",
    });

    return exportRecord;
  });

  pingWorker();
  return pending;
}

/**
 * The character `userId` may export as a PDF, or null: one they own or
 * contribute to (or a child of such a parent: 3.5's bonded creature). Through
 * `campaignId`, the character must be linked to that campaign, which they may
 * read (`findReadableCampaign`: a member), and its Game Master may export it
 * too. Checked when the export is queued and again when the worker runs it, so
 * access revoked in between is honored.
 */
export async function findExportableCharacter(userId: string, characterId: string, campaignId?: string) {
  if (campaignId) {
    if (!(await PlayerCharacters.findOne(db, { characterId, campaignId }))) return null;
    const readable = await findReadableCampaign(db, { userId }, campaignId);
    if (!readable) return null;
    if (readable.policy.isGameMaster()) return (await Characters.findOne(db, { id: characterId })) ?? null;
  }
  return findEditableCharacterOrChild(db, characterId, userId);
}
