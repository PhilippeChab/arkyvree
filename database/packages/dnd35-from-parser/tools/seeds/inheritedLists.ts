/** The spell lists classes draw on others' lists for (`inheritsFrom`), and a spell's level on one. */

import ReferenceLoader from "@/database/packages/dnd35-from-parser/tools/references/ReferenceLoader.ts";
import { type InheritedSpellList } from "@/database/packages/dnd35-from-parser/tools/types/classes.ts";
import { type SpellReference } from "@/database/packages/dnd35-from-parser/tools/types/spells.ts";
import { classSpells } from "@/database/packages/dnd35/content/aptitudes/names.ts";

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

/** The lists a book's classes draw on others' lists for (`inheritsFrom`): each class's own, or each of its `lists`. */
export function getInheritedLists(book: string): { aptitude: string; list: InheritedSpellList }[] {
  const lists: { aptitude: string; list: InheritedSpellList }[] = [];
  for (const { ref } of ReferenceLoader.loadClasses(book)) {
    const { spells } = ref.mapping;
    if (!spells || !ref.raw?.name) continue;
    if (spells.inheritsFrom) lists.push({ aptitude: classSpells(ref.raw.name), list: spells.inheritsFrom });
    for (const list of spells.lists ?? []) lists.push({ aptitude: list.name, list: list.inheritsFrom });
  }
  return lists;
}
