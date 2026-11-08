import { addJob, db } from "@/server/database/index.ts";
import { pingWorker } from "@/server/queue.ts";
import { Activities, Characters, Exports, PlayerCharacters } from "@/server/repositories/index.ts";
import { findReadableCampaign } from "@/server/services/campaigns/index.ts";
import { PENDING_EXPORT_TTL_MS, toExportJobKey } from "@/server/services/exports/index.ts";
import { CharactersPolicy, isAllowed } from "@/server/services/policies/index.ts";
import { withAccountWrite } from "@/server/services/writes/index.ts";
import { TARGET_TYPES } from "@/shared/activityTargets.ts";
import { formatSheetFileName } from "@/shared/exports.ts";
import type { Character, Session } from "@/shared/relations.ts";

import { toNotesReading } from "./notesReading.ts";

/** The campaign `campaignId` the user may read, if the character is linked to it; none otherwise. */
async function findLinkedCampaign(session: Session, characterId: string, campaignId: string) {
  if (!(await PlayerCharacters.findOne(db, { characterId, campaignId }))) return undefined;
  return await findReadableCampaign(db, session, campaignId);
}

/**
 * Where a PDF export's activity and failure notification link to: the
 * character page, or for an export requested from a campaign the campaign
 * character page (which its Game Master reads whatever becomes of the campaign).
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
  const pending = await withAccountWrite(session.userId, async (tx) => {
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
 * The character `session` may export as a PDF, and how its export reads its private notes (`notes`), or null: as its
 * policy says (`CharactersPolicy.canExport`: its editors, while they may edit it, but a demo's; `isPrivateNotesReader`).
 * Through `campaignId`, the character must be linked to that campaign, which they may read (`findReadableCampaign`: a
 * member), and the campaign's policy says (`CampaignsPolicy.canExportCharacter`: its Game Master too;
 * `isPrivateNotesReader`). Checked when the export is queued and again when the worker runs it (as its user: a demo's
 * export is never queued), so access revoked in between is honored.
 */
export async function findExportableCharacter(session: Session, characterId: string, campaignId?: string) {
  // Through a campaign, its link and the campaign come first, so a non-member gets no further
  const readable = campaignId && (await findLinkedCampaign(session, characterId, campaignId));
  if (campaignId && !readable) return null;

  const character = await Characters.findOne(db, { id: characterId });
  if (!character) return null;
  const policy = await CharactersPolicy.for(db, session, character);
  if (readable) {
    if (!isAllowed(() => readable.policy.canExportCharacter(policy))) return null;
    return { character, notes: toNotesReading(readable.policy.isPrivateNotesReader(policy)) };
  }
  if (!isAllowed(() => policy.canExport())) return null;
  return { character, notes: toNotesReading(policy.isPrivateNotesReader()) };
}
