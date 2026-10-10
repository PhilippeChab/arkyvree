import type { BondedPlan, NewBondedCreature } from "@/engine/index.ts";
import type { Db } from "@/server/database/index.ts";
import { CharacterAbilities, CharacterLevels, Characters } from "@/server/repositories/index.ts";
import type { Character } from "@/shared/relations.ts";

/** A new creature, its row as the engine plans it, with its ability scores. */
async function createCreature(tx: Db, creature: NewBondedCreature) {
  const [bonded] = await Characters.create(tx, creature.row);
  await CharacterAbilities.createMany(
    tx,
    creature.abilities.map((ability) => ({ characterId: bonded.id, ...ability })),
  );
  return bonded.id;
}

/**
 * Writes what a master's bonded creatures become (`plans`, the engine's): each kind's creature removed, made (its row
 * as the engine plans it, with its ability scores) or kept, and the levels the one it keeps or makes takes or loses. A level save plans them from the creatures it read with the master locked, so two
 * saves can't both see no creature and both make one (the partial unique index on its kind is the backstop). An
 * archived master's creatures are left as they are: an archive that ran before the lock archived them with it.
 */
export async function writeBondedCreatures(tx: Db, master: Character, plans: BondedPlan[]): Promise<void> {
  if (!(await Characters.lock(tx, { id: master.id }))) return;
  for (const plan of plans) {
    if (plan.removedId) await Characters.delete(tx, { id: plan.removedId });
    if (!plan.levels) continue;
    const creatureId = "created" in plan ? await createCreature(tx, plan.created) : plan.keptId;
    for (const level of plan.levels.added) await CharacterLevels.create(tx, { characterId: creatureId, ...level });
    for (const id of plan.levels.removedIds) await CharacterLevels.delete(tx, { id });
  }
}
