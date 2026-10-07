import type { RulesetData } from "@/engine/core/view/index.ts";
import {
  type Dnd35DetailedCharacter,
  type NewBondedCreature,
  planBondedCreature,
  planBondedLevels,
} from "@/engine/rulesets/dnd3.5/index.ts";
import type { Db } from "@/server/database/index.ts";
import { CharacterAbilities, CharacterLevels, Characters } from "@/server/repositories/index.ts";
import { BONDED_KIND_SLUGS, type BondedKind } from "@/shared/dnd3.5/bondedKinds.ts";
import type { Character } from "@/shared/relations.ts";

/** The master's new creature of `kind`: the master's, in its ruleset, of its alignment and gender. */
async function createBonded(tx: Db, master: Character, kind: BondedKind, creature: NewBondedCreature) {
  const [bonded] = await Characters.create(tx, {
    userId: master.userId,
    rulesetId: master.rulesetId,
    raceId: creature.raceId,
    kind,
    parentCharacterId: master.id,
    name: creature.name,
    alignment: master.alignment,
    gender: master.gender,
    xp: 0,
  });
  await CharacterAbilities.createMany(
    tx,
    creature.abilities.map((ability) => ({ characterId: bonded.id, ...ability })),
  );
  return bonded.id;
}

/** The master's creature of `kind` made, kept or removed, and its levels taken or lost, as the 3.5 module plans. */
async function reconcileBonded(
  tx: Db,
  masterRecord: Character,
  kind: BondedKind,
  detailedMaster: Dnd35DetailedCharacter,
  rulesetData: RulesetData,
): Promise<void> {
  // SELECT … FOR UPDATE on the master serializes concurrent reconciles for
  // the same character — without it, two overlapping finalizeLevelUp /
  // updateLevel transactions both observe "no existing bonded" and both
  // INSERT, leaking an orphan row. The partial unique index on
  // (parent_character_id, kind) is the backstop for any path that skips
  // this helper.
  //
  // Reading deletedAt under the lock catches the archive-vs-reconcile race:
  // an outer transaction may have captured `masterRecord` as alive, then
  // blocked here while a concurrent archiveCharacter ran. Without this
  // check we'd insert a fresh live bonded under a now-archived master
  // (the cascade already ran), leaving an orphan visible only by deep link.
  if (!(await Characters.lock(tx, { id: masterRecord.id }))) return;

  const existing = await Characters.findOne(tx, { parentCharacterId: masterRecord.id, kind });
  const plan = planBondedCreature(detailedMaster, kind, existing, rulesetData);
  if (plan.removedId) await Characters.delete(tx, { id: plan.removedId });
  if (!plan.levels) return;

  const bondedId = "created" in plan ? await createBonded(tx, masterRecord, kind, plan.created) : plan.keptId;
  const levels = await CharacterLevels.findMany(tx, { characterId: bondedId });
  const { added, removedIds } = planBondedLevels(levels, plan.levels, rulesetData);
  for (const level of added) await CharacterLevels.create(tx, { characterId: bondedId, ...level });
  for (const id of removedIds) await CharacterLevels.delete(tx, { id });
}

export async function reconcileAllBondedKinds(
  tx: Db,
  masterRecord: Character,
  detailedMaster: Dnd35DetailedCharacter,
  rulesetData: RulesetData,
): Promise<void> {
  for (const kind of BONDED_KIND_SLUGS) await reconcileBonded(tx, masterRecord, kind, detailedMaster, rulesetData);
}
