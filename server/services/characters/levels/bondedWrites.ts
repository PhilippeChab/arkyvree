import type { planBondedCreatures } from "@/engine/index.ts";
import type { Db } from "@/server/database/index.ts";
import { CharacterAbilities, CharacterLevels, Characters } from "@/server/repositories/index.ts";
import type { Character } from "@/shared/relations.ts";

/** The master's new creature of `kind`, with its ability scores: the master's, of its alignment and gender. */
async function createCreature(
  tx: Db,
  master: Character,
  kind: string,
  creature: Extract<ReturnType<typeof planBondedCreatures>[number], { created: unknown }>["created"],
) {
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

/**
 * Writes what a master's bonded creatures become (`plans`, the engine's): each kind's creature removed, made (the
 * master's, in its ruleset, of its alignment and gender, with its ability scores) or kept, and the levels the one it
 * keeps or makes takes or loses. A level save plans them from the creatures it read with the master locked, so two
 * saves can't both see no creature and both make one (the partial unique index on its kind is the backstop). An
 * archived master's creatures are left as they are: an archive that ran before the lock archived them with it.
 */
export async function writeBondedCreatures(
  tx: Db,
  master: Character,
  plans: ReturnType<typeof planBondedCreatures>,
): Promise<void> {
  if (!(await Characters.lock(tx, { id: master.id }))) return;
  for (const plan of plans) {
    if (plan.removedId) await Characters.delete(tx, { id: plan.removedId });
    if (!plan.levels) continue;
    const creatureId = "created" in plan ? await createCreature(tx, master, plan.kind, plan.created) : plan.keptId;
    for (const level of plan.levels.added) await CharacterLevels.create(tx, { characterId: creatureId, ...level });
    for (const id of plan.levels.removedIds) await CharacterLevels.delete(tx, { id });
  }
}
