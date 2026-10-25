import type { RulesetRawData, ViewEntities, ViewJoins } from "@/engine/core/view/index.ts";

/** A ruleset's own rows of a join (`join`), as the cache keeps them, typed by its module's registry. */
function joinRows<J extends keyof ViewJoins>(raw: RulesetRawData, join: J) {
  return (raw.joins[join] ?? []) as ViewJoins[J][];
}

/** A ruleset's own rows of a kind (`type`), as the cache keeps them, typed by its module's registry. */
function kindRows<K extends keyof ViewEntities>(raw: RulesetRawData, type: K) {
  return (raw.entities[type] ?? []) as ViewEntities[K][];
}

/** A ruleset's own rows (`raw`, as the cache keeps them) as 3.5's lists: each kind's and each join's, typed. */
export function rawLists(raw: RulesetRawData) {
  return {
    abilities: kindRows(raw, "abilities"),
    aptitudes: kindRows(raw, "aptitudes"),
    feats: kindRows(raw, "feats"),
    items: kindRows(raw, "items"),
    klasses: kindRows(raw, "classes"),
    klassLevels: kindRows(raw, "class_levels"),
    klassLevelFeats: joinRows(raw, "class_level_feats"),
    klassLevelSpells: joinRows(raw, "class_level_spells"),
    klassLevelSaves: joinRows(raw, "class_level_saves"),
    klassSkills: joinRows(raw, "class_skills"),
    languages: kindRows(raw, "languages"),
    mechanics: kindRows(raw, "mechanics"),
    spells: kindRows(raw, "spells"),
    races: kindRows(raw, "races"),
    saves: kindRows(raw, "saves"),
    skills: kindRows(raw, "skills"),
  };
}
