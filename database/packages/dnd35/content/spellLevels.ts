import type { ClassSeed } from "@/database/packages/dnd35/content/types.ts";

/** The class level each spell level opens at, by class. */
export function buildClassSpellLevels(classes: ClassSeed[]): Record<string, Record<number, number>> {
  const byClass: Record<string, Record<number, number>> = {};
  for (const { name, spells } of classes) {
    if (!spells) continue;
    const levels: Record<number, number> = {};
    const offset = spells.noCantrips ? 1 : 0;
    for (const [i, row] of spells.perDay.entries()) {
      for (const [j, count] of row.entries()) {
        if (count !== undefined && !(j + offset in levels)) levels[j + offset] = i + 1;
      }
    }
    byClass[name] = levels;
  }
  return byClass;
}
