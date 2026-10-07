/** A class's spell slots, and the lists they go to. */

import { type ClassReference } from "@/database/packages/dnd35-from-parser/tools/types/classes.ts";
import { classSpells } from "@/database/packages/dnd35/content/aptitudes/names.ts";

/** The spell lists a class's slots go to (`spells.lists`), or its own, "<Class> Spells": none for a class without slots. */
export function getClassSpellLists(ref: ClassReference): string[] {
  const spells = getClassSpells(ref);
  if (!spells) return [];
  return spells.lists?.map((list) => list.name) ?? [classSpells(ref.raw.name)];
}

/** A class's spell slots: detected, with the overrides' fields over them. None when it has none (`noSpells` removes them). */
export function getClassSpells(ref: ClassReference) {
  const { spells } = ref.mapping;
  return spells && ref.overrides?.spells ? { ...spells, ...ref.overrides.spells } : spells;
}
