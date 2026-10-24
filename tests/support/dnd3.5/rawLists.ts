import type { RulesetRawData } from "@/engine/core/view/index.ts";
import type {
  Aptitude,
  FeatWithAptitudes,
  Item,
  Klass,
  KlassLevel,
  KlassLevelFeat,
  KlassLevelPower,
  KlassLevelSave,
  KlassSkill,
  Language,
  Mechanic,
  PowerWithAptitudes,
  Race,
  RulesetAbility,
  RulesetSave,
  Skill,
} from "@/engine/rulesets/dnd3.5/view/rows.ts";

/** A ruleset's own rows (`raw`, as the cache keeps them) as 3.5's lists: each kind's and each join's, typed. */
export function rawLists(raw: RulesetRawData) {
  const { entities, joins } = raw;
  return {
    abilities: (entities.abilities ?? []) as unknown as RulesetAbility[],
    aptitudes: (entities.aptitudes ?? []) as unknown as Aptitude[],
    feats: (entities.feats ?? []) as unknown as FeatWithAptitudes[],
    items: (entities.items ?? []) as unknown as Item[],
    klasses: (entities.klasses ?? []) as unknown as Klass[],
    klassLevels: (entities.klass_levels ?? []) as unknown as KlassLevel[],
    klassLevelFeats: (joins.klass_level_feats ?? []) as unknown as KlassLevelFeat[],
    klassLevelPowers: (joins.klass_level_powers ?? []) as unknown as KlassLevelPower[],
    klassLevelSaves: (joins.klass_level_saves ?? []) as unknown as KlassLevelSave[],
    klassSkills: (joins.klass_skills ?? []) as unknown as KlassSkill[],
    languages: (entities.languages ?? []) as unknown as Language[],
    mechanics: (entities.mechanics ?? []) as unknown as Mechanic[],
    powers: (entities.powers ?? []) as unknown as PowerWithAptitudes[],
    races: (entities.races ?? []) as unknown as Race[],
    saves: (entities.saves ?? []) as unknown as RulesetSave[],
    skills: (entities.skills ?? []) as unknown as Skill[],
  };
}
