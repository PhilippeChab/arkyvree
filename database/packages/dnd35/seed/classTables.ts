/** A class's tables by level: its base attack, its saves and its spell slots, and the level each spell level opens at. */

import type {
  BabType,
  ClassSeed,
  ModifierSeed,
  RequirementEntry,
  SaveType,
} from "@/database/packages/dnd35/content/types.ts";

export const BAB: Record<BabType, (level: number) => number> = {
  good: (level) => level,
  medium: (level) => Math.floor((level * 3) / 4),
  poor: (level) => Math.floor(level / 2),
};

export const CASTER_LEVEL_APTITUDES = {
  divine: ["Bonus Divine Caster Level"],
  arcane: ["Bonus Arcane Caster Level"],
  any: ["Bonus Caster Level"],
  dual: ["Bonus Arcane Caster Level", "Bonus Divine Caster Level"],
};

export const SAVE: Record<SaveType, (level: number) => number> = {
  good: (level) => Math.floor(level / 2) + 2,
  poor: (level) => Math.floor(level / 3),
};

/** A spellcaster's slots in one of its lists, gated by its requirements. */
function listSlots(
  spells: NonNullable<ClassSeed["spells"]>,
  list: { slug: string; requirements: RequirementEntry[] },
): (ModifierSeed & { level: number })[] {
  const slot = (spellLevel: number, kind: string) =>
    `aptitudes.${list.slug}.${spellLevel + (spells.noCantrips ? 1 : 0)}.${kind}`;
  const modifier = (level: number, target: string, value: string, operator: string) => ({
    level,
    target,
    value,
    valueType: "number",
    operator,
    ...(list.requirements.length > 0 && { requirements: list.requirements }),
  });
  return [
    ...tableGains(spells.perDay).map((g) => modifier(g.level, slot(g.spellLevel, "uses"), String(g.delta), "add")),
    ...tableGains(spells.known ?? []).map((g) =>
      modifier(g.level, slot(g.spellLevel, "allowed"), String(g.delta), "add"),
    ),
    ...(spells.knowAll
      ? tableOpenings(spells.perDay).map((o) => modifier(o.level, slot(o.spellLevel, "allowed"), "-1", "set"))
      : []),
  ];
}

/** What a table (by class level, then spell level) adds at each class level: `delta` more at `spellLevel`. */
function tableGains(table: number[][]) {
  return table.flatMap((row, i) =>
    row.flatMap((count, spellLevel) => {
      const delta = count - (table[i - 1]?.[spellLevel] ?? 0);
      return delta > 0 ? [{ level: i + 1, spellLevel, delta }] : [];
    }),
  );
}

/** The spell levels a table opens at each class level. */
function tableOpenings(table: number[][]) {
  return table.flatMap((row, i) => {
    const opened = table[i - 1]?.length ?? 0;
    return Array.from({ length: Math.max(row.length - opened, 0) }, (_, j) => ({
      level: i + 1,
      spellLevel: opened + j,
    }));
  });
}

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

/**
 * A spellcaster's slots, by class level: its spells a day, and the spells it knows (`known`) or can prepare,
 * all of each level it can cast (`knowAll`). They go to its list, or to each of its `lists` while that one's
 * requirements are met.
 */
export function spellSlots(spells: NonNullable<ClassSeed["spells"]>): (ModifierSeed & { level: number })[] {
  const lists = spells.lists ?? [{ slug: spells.slug, requirements: [] }];
  return lists.flatMap((list) => listSlots(spells, list));
}
