/** A spellcaster's table of slots (by class level, then spell level): the class level it opens each spell level at. */

import type { ClassSeed } from "@/database/packages/dnd35/content/classes/types.ts";

/** A class that casts spells: its table of slots. */
export type SpellcastingClass = ClassSeed & { spells: NonNullable<ClassSeed["spells"]> };

/** The class of `classes` named `name`, which casts spells: what a domain's or a school's slots open with. */
export function findSpellcastingClass(classes: ClassSeed[], name: string): SpellcastingClass {
  const klass = classes.find((c) => c.name === name);
  if (!klass?.spells) throw new Error(`${name} isn't a spellcasting class of these classes`);
  return { ...klass, spells: klass.spells };
}

/**
 * The class level each of a spellcaster's spell levels opens at, by spell level (its first is 1 for a class without
 * cantrips): where its spells a day first give it slots. A domain's or a school's slots open with it.
 */
export function getClassSpellLevels(spells: NonNullable<ClassSeed["spells"]>): Record<number, number> {
  const levels: Record<number, number> = {};
  const offset = spells.noCantrips ? 1 : 0;
  for (const { level, spellLevel } of getSpellLevelOpenings(spells.perDay)) levels[spellLevel + offset] ??= level;
  return levels;
}

/** The spell levels a table opens at each class level. */
export function getSpellLevelOpenings(table: number[][]) {
  return table.flatMap((row, i) => {
    const opened = table[i - 1]?.length ?? 0;
    return Array.from({ length: Math.max(row.length - opened, 0) }, (_, j) => ({
      level: i + 1,
      spellLevel: opened + j,
    }));
  });
}
