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
    klasses: kindRows(raw, "klasses"),
    klassLevels: kindRows(raw, "klass_levels"),
    klassLevelFeats: joinRows(raw, "klass_level_feats"),
    klassLevelPowers: joinRows(raw, "klass_level_powers"),
    klassLevelSaves: joinRows(raw, "klass_level_saves"),
    klassSkills: joinRows(raw, "klass_skills"),
    languages: kindRows(raw, "languages"),
    mechanics: kindRows(raw, "mechanics"),
    powers: kindRows(raw, "powers"),
    races: kindRows(raw, "races"),
    saves: kindRows(raw, "saves"),
    skills: kindRows(raw, "skills"),
  };
}
