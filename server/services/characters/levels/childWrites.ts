import type { Db } from "@/drizzle/database.ts";
import type { ChildPlan, NewChild } from "@/engine/index.ts";
import { CharacterAdvancements, CharacterLinks, Characters } from "@/server/repositories/index.ts";
import type { Character } from "@/shared/relations.ts";

/** A new child, its row as the engine plans it, with its links (3.5's ability scores). */
async function createChild(tx: Db, child: NewChild) {
  const [created] = await Characters.create(tx, child.row);
  for (const [link, links] of Object.entries(child.links))
    await CharacterLinks.createPlanned(tx, link, created.id, links);
  return created.id;
}

/**
 * Writes what a character's children become (`plans`, the engine's: 3.5's bonded creatures): each kind's child removed,
 * made (its row as the engine plans it, with its links) or kept, and the levels the one it keeps or makes takes or
 * loses. A level save plans them from the children it read with the parent locked, so two saves can't both see no child
 * and both make one: the lock alone keeps a parent to one live child of a kind, since migration 0080 dropped the
 * database's index of it (`characters_one_bonded_per_kind_per_master_idx`). An archived parent's children are left as
 * they are: an archive that ran before the lock archived them with it.
 */
export async function writeChildren(tx: Db, parent: Character, plans: ChildPlan[]): Promise<void> {
  if (!(await Characters.lock(tx, { id: parent.id }))) return;
  for (const plan of plans) {
    if (plan.removedId) await Characters.delete(tx, { id: plan.removedId });
    if (!plan.levels) continue;
    const childId = "created" in plan ? await createChild(tx, plan.created) : plan.keptId;
    for (const level of plan.levels.added) await CharacterAdvancements.create(tx, { ...level, characterId: childId });
    for (const id of plan.levels.removedIds) await CharacterAdvancements.delete(tx, { id });
  }
}
