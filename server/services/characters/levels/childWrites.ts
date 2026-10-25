import type { Db } from "@/drizzle/database.ts";
import type { ChildPlan, NewChild } from "@/engine/index.ts";
import { CharacterAdvancements, CharacterLinks, Characters } from "@/server/repositories/index.ts";
import type { Character } from "@/shared/relations.ts";

import { createAdvancement } from "./advancementWrites.ts";

/** A new child, its row as the engine plans it, with its links by role (3.5's ability scores). */
async function createChild(tx: Db, child: NewChild) {
  const [created] = await Characters.create(tx, child.row);
  for (const [role, links] of Object.entries(child.links)) await CharacterLinks.createMany(tx, created.id, role, links);
  return created.id;
}

/**
 * Writes what a character's children become (`plans`, the engine's: 3.5's bonded creatures): each kind's child removed,
 * made (its row as the engine plans it, with its links) or kept, and the advancements the one it keeps or makes takes
 * (each with its picks) or loses. A level save plans them from the children it read with the parent locked, so two saves can't both see no child
 * and both make one, which the database's index refuses besides (`characters_one_live_child_per_kind_idx`). An
 * archived parent's children are left as they are: an archive that ran before the lock archived them with it.
 */
export async function writeChildren(tx: Db, parent: Character, plans: ChildPlan[]): Promise<void> {
  if (!(await Characters.lock(tx, { id: parent.id }))) return;
  for (const plan of plans) {
    if (plan.removedId) await Characters.delete(tx, { id: plan.removedId });
    if (!plan.levels) continue;
    const childId = "created" in plan ? await createChild(tx, plan.created) : plan.keptId;
    for (const advancement of plan.levels.added) await createAdvancement(tx, childId, advancement);
    for (const id of plan.levels.removedIds) await CharacterAdvancements.delete(tx, { id });
  }
}
