/** The spell lists a class's slots go to. */

import { type ClassReference } from "@/database/packages/dnd35-from-parser/tools/types/classes.ts";
import { classSpells } from "@/database/packages/dnd35/content/aptitudes/names.ts";

/** The spell lists a class's slots go to (`spells.lists`), or its own, "<Class> Spells": none for a class without slots. */
export function getClassSpellLists(ref: ClassReference): string[] {
  const { spells } = ref.mapping;
  if (!spells) return [];
  return spells.lists?.map((list) => list.name) ?? [classSpells(ref.raw.name)];
}
