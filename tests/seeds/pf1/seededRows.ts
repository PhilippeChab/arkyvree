import { PF1_RULESET_NAME } from "@/content/pf1/rulesetNames.ts";
import type { RulesetRawData } from "@/engine/core/view/index.ts";
import type { Pf1Kinds } from "@/engine/rulesets/pf1/view/rows.ts";
import { RulesetViews } from "@/server/cow/index.ts";
import { db } from "@/server/database/index.ts";
import { Rulesets } from "@/server/repositories/index.ts";

/** A ruleset's own rows of a kind (`type`), as the cache keeps them, typed as Pathfinder declares its kinds. */
function kindRows<K extends keyof Pf1Kinds>(raw: RulesetRawData, type: K) {
  return (raw.entities[type] ?? []) as Pf1Kinds[K][];
}

/** A ruleset's own links of a role from entities of a kind (`type`, `role`). */
function linkRows(raw: RulesetRawData, type: string, role: string) {
  return [...raw.links.values()]
    .filter((held) => held.type === type)
    .flatMap((held) => held.links.filter((link) => link.role === role));
}

/**
 * The rows the seed wrote into a seeded Pathfinder ruleset ("Core PSD 1" unless named), as the cache keeps them: each
 * kind's, its links by role, its customizations, and lookups by name.
 */
export async function seededRows(rulesetName = PF1_RULESET_NAME) {
  const ruleset = await Rulesets.findOne(db, { name: rulesetName });
  if (!ruleset) throw new Error(`${rulesetName} isn't seeded`);
  const raw = await RulesetViews.getRawData(ruleset.id);
  const rows = {
    abilities: kindRows(raw, "abilities"),
    aptitudes: kindRows(raw, "aptitudes"),
    classes: kindRows(raw, "classes"),
    classLevels: kindRows(raw, "class-levels"),
    feats: kindRows(raw, "feats"),
    items: kindRows(raw, "items"),
    languages: kindRows(raw, "languages"),
    races: kindRows(raw, "races"),
    saves: kindRows(raw, "saves"),
    skills: kindRows(raw, "skills"),
    spells: kindRows(raw, "spells"),
  };
  const named = <T extends { name: string }>(list: T[], name: string) => {
    const row = list.find((r) => r.name === name);
    if (!row) throw new Error(`${name} isn't seeded in ${rulesetName}`);
    return row;
  };
  return {
    ...rows,
    raw,
    ruleset,
    baseBonusLinks: linkRows(raw, "class-levels", "baseBonus"),
    feat: (name: string) => named(rows.feats, name),
    /** A class's level `level`, of its player character's class (`partition` "pc") of that name. */
    classLevel: (klass: string, level: number) => {
      const { id } = rows.classes.find((c) => c.name === klass && c.partition === "pc")!;
      return rows.classLevels.find((l) => l.ownerId === id && l.position === level)!;
    },
    modifiersOf: (sourceId: string) => raw.modifiers.filter((m) => m.sourceId === sourceId),
    pcRace: (name: string) => rows.races.find((r) => r.name === name && r.partition === "pc")!,
  };
}
