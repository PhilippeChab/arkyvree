import { getTableName } from "drizzle-orm";

import { charactersInCharacter, playerCharactersInCampaign } from "@/drizzle/schema.ts";
import { db, type Db, withTransaction } from "@/server/database/index.ts";
import { NotFoundError } from "@/server/errors/index.ts";
import { addJob, pingWorker } from "@/server/queue.ts";
import { Visibility } from "@/server/repositories/BaseRepository.ts";
import { Activities, Characters, PlayerCharacters } from "@/server/repositories/index.ts";
import type { RulesetFactory } from "@/server/rulesets/RulesetFactory.ts";
import type { DetailedCharacterInterface } from "@/server/rulesets/types.ts";
import { CampaignsPolicy } from "@/server/services/policies/index.ts";
import { BONDED_KIND_SLUGS, type BondedKind } from "@/shared/dnd3.5/bondedKinds.ts";
import type { Character, Session } from "@/shared/relations.ts";

/**
 * The character the session's user may edit (they own it or contribute to it), or a 404. `Visibility.All` finds an
 * archived one too, whose sheet stays readable.
 */
export async function getEditableCharacter(
  db: Db,
  session: Session,
  characterId: string,
  visibility: Visibility = Visibility.UnarchivedOnly,
) {
  const character = await Characters.findOneEditable(db, { id: characterId, userId: session.userId }, visibility);
  if (!character) throw new NotFoundError("Character not found");
  return character;
}

export type BondedEntry = { record: Character; detailed: DetailedCharacterInterface };

export async function loadBondedByKind(
  rulesetModule: Awaited<ReturnType<typeof RulesetFactory.fromRulesetId>>,
  masterId: string,
): Promise<Partial<Record<BondedKind, BondedEntry>>> {
  const out: Partial<Record<BondedKind, BondedEntry>> = {};
  for (const kind of BONDED_KIND_SLUGS) {
    const record = await Characters.findOne(
      db,
      {
        parentCharacterId: masterId,
        kind,
      },
      Visibility.All,
    );
    if (!record) continue;
    const detailed = rulesetModule.createDetailedCharacter(record, kind);
    await detailed.build();
    out[kind] = { record, detailed };
  }
  return out;
}

export async function findEditableCharacterOrBonded(tx: Db, characterId: string, userId: string) {
  const pc = await Characters.findOneEditable(tx, { id: characterId, userId });
  if (pc) return pc;
  const bonded = await Characters.findOne(tx, { id: characterId });
  if (!bonded || bonded.kind === "pc" || !bonded.parentCharacterId) return null;
  const master = await Characters.findOneEditable(tx, {
    id: bonded.parentCharacterId,
    userId,
  });
  return master ? bonded : null;
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
