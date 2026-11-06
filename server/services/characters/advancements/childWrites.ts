import type { Db } from "@/drizzle/database.ts";
import type { ChildPlan } from "@/engine/index.ts";
import { CharacterAdvancements, Characters } from "@/server/repositories/index.ts";
import { createNewCharacter } from "@/server/services/characters/newCharacterWrites.ts";
import type { BaseRules } from "@/shared/enums.ts";

import { createAdvancement } from "./advancementWrites.ts";

/**
 * Writes what a character's children become (`plans`, the engine's: 3.5's bonded creatures): each kind's child removed,
 * made (its row as the engine plans it, with its links) or kept, and the advancements the one it keeps or makes takes
 * (each with its picks) or loses. Its caller holds the parent's lock (an advancement save's `withCharacterWrite`, an
 * import's new row), or runs alone (the seeds'): an advancement save plans them from the children it read with the
 * parent locked, so two saves can't both see no child and both make one, which the database's index refuses besides
 * (`characters_one_live_child_per_kind_idx`). Each row is of the parent's ruleset's base rules (`baseRules`).
 */
export async function writeChildren(tx: Db, baseRules: BaseRules, plans: ChildPlan[]): Promise<void> {
  for (const plan of plans) {
    if (plan.removedId) await Characters.delete(tx, { id: plan.removedId });
    if (!plan.advancementChanges) continue;
    const childId = "created" in plan ? (await createNewCharacter(tx, baseRules, plan.created)).id : plan.keptId;
    for (const advancement of plan.advancementChanges.added)
      await createAdvancement(tx, baseRules, childId, advancement);
    for (const id of plan.advancementChanges.removedIds) await CharacterAdvancements.delete(tx, { id });
  }
}
