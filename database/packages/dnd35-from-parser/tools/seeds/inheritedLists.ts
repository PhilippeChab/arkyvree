/** A spell's level on a list a class draws on others' lists for (`inheritsFrom`). */

import { type InheritedSpellList } from "@/database/packages/dnd35-from-parser/tools/types/classes.ts";
import { type SpellReference } from "@/database/packages/dnd35-from-parser/tools/types/spells.ts";

/**
 * A spell's level on a list a class draws on (`inheritsFrom`): on the first of its classes' lists that has it, when
 * it's of the list's schools and has none of its excluded descriptors.
 */
export function getInheritedLevel(
  spell: Pick<SpellReference["raw"][number], "school" | "descriptors">,
  levelEntries: { className: string; level: number }[],
  list: InheritedSpellList,
): number | undefined {
  if (list.schools && !list.schools.includes(spell.school)) return undefined;
  if (spell.descriptors.some((descriptor) => list.excludeDescriptors?.includes(descriptor))) return undefined;
  for (const className of list.classes) {
    const entry = levelEntries.find((le) => le.className === className);
    if (entry) return entry.level;
  }
  return undefined;
}
