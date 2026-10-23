import type { Db } from "@/drizzle/database.ts";
import type { BondedPlan, NewBondedCreature } from "@/engine/index.ts";
import { CharacterLevels, CharacterLinks, Characters } from "@/server/repositories/index.ts";
import type { Character } from "@/shared/relations.ts";

/** A new creature, its row as the engine plans it, with its links (3.5's ability scores). */
async function createCreature(tx: Db, creature: NewBondedCreature) {
  const [bonded] = await Characters.create(tx, creature.row);
  for (const [link, rows] of Object.entries(creature.links)) {
    await CharacterLinks.createMany(
      tx,
      link,
      rows.map((row) => ({ characterId: bonded.id, ...row })),
    );
  }
  return bonded.id;
}

/**
 * Writes what a master's bonded creatures become (`plans`, the engine's): each kind's creature removed, made (its row
 * as the engine plans it, with its links) or kept, and the levels the one it keeps or makes takes or loses. A
 * level save plans them from the creatures it read with the master locked, so two saves can't both see no creature and
 * both make one: the lock alone keeps a master to one live creature of a kind, since migration 0080 dropped the
 * database's index of it (`characters_one_bonded_per_kind_per_master_idx`). An archived master's creatures are left as
 * they are: an archive that ran before the lock archived them with it.
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
