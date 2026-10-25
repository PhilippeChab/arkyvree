import type { RulesetRawData, ViewKinds } from "@/engine/core/view/index.ts";

/** A ruleset's own rows of a kind (`type`), as the cache keeps them, typed by its module's registry. */
function kindRows<K extends keyof ViewKinds>(raw: RulesetRawData, type: K) {
  return (raw.entities[type] ?? []) as ViewKinds[K][];
}

/** A ruleset's own links of a role from entities of a kind (`type`, `role`), to a kind (`toType`) when it says. */
function linkRows(raw: RulesetRawData, type: string, role: string, toType?: string) {
  return [...raw.links.values()]
    .filter((held) => held.type === type)
    .flatMap((held) => held.links.filter((link) => link.role === role && (!toType || link.toType === toType)));
}

/**
 * A ruleset's own rows (`raw`, as the cache keeps them) as 3.5's lists: each kind's, typed, and its links by role: a
 * class's skills, its levels' grants and saves, a feat's pools and a spell's lists.
 */
export function rawLists(raw: RulesetRawData) {
  return {
    abilities: kindRows(raw, "abilities"),
    aptitudes: kindRows(raw, "aptitudes"),
    featPools: linkRows(raw, "feats", "listedIn"),
    feats: kindRows(raw, "feats"),
    items: kindRows(raw, "items"),
    klasses: kindRows(raw, "classes"),
    klassLevels: kindRows(raw, "class_levels"),
    klassLevelFeats: linkRows(raw, "class_levels", "grants", "feats"),
    klassLevelSpells: linkRows(raw, "class_levels", "grants", "spells"),
    klassLevelSaves: linkRows(raw, "class_levels", "baseBonus"),
    klassSkills: linkRows(raw, "classes", "classSkill"),
    languages: kindRows(raw, "languages"),
    mechanics: kindRows(raw, "mechanics"),
    spellLists: linkRows(raw, "spells", "listedIn"),
    spells: kindRows(raw, "spells"),
    races: kindRows(raw, "races"),
    saves: kindRows(raw, "saves"),
    skills: kindRows(raw, "skills"),
  };
}
