import type { Db } from "@/drizzle/database.ts";
import type { ChildPlan } from "@/engine/index.ts";
import { CharacterAdvancements, Characters } from "@/server/repositories/index.ts";
import { createNewCharacter } from "@/server/services/characters/newCharacterWrites.ts";

import { createAdvancement } from "./advancementWrites.ts";

/**
 * Writes what a character's children become (`plans`, the engine's: 3.5's bonded creatures): each kind's child removed,
 * made (its row as the engine plans it, with its links) or kept, and the advancements the one it keeps or makes takes
 * (each with its picks) or loses. Its caller holds the parent's lock (a level save's `withCharacterWrite`, an import's
 * new row): a level save plans them from the children it read with the parent locked, so two saves can't both see no
 * child and both make one, which the database's index refuses besides (`characters_one_live_child_per_kind_idx`).
 */
export async function writeChildren(tx: Db, plans: ChildPlan[]): Promise<void> {
  for (const plan of plans) {
    if (plan.removedId) await Characters.delete(tx, { id: plan.removedId });
    if (!plan.levels) continue;
    const childId = "created" in plan ? (await createNewCharacter(tx, plan.created)).id : plan.keptId;
    for (const advancement of plan.levels.added) await createAdvancement(tx, childId, advancement);
    for (const id of plan.levels.removedIds) await CharacterAdvancements.delete(tx, { id });
  }
}
