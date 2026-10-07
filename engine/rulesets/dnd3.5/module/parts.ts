import type {
  ClassesEffects,
  ClassLevelsEffects,
  FeatsEffects,
  ItemsEffects,
  PowersEffects,
  RacesEffects,
  RulesetsEffects,
  SkillsEffects,
} from "./effects/index.ts";
import type {
  AptitudesRules,
  ClassesRules,
  ClassLevelsRules,
  FeatsRules,
  InventoryRules,
  ItemsRules,
  LevelsRules,
  PowersRules,
  RacesRules,
  RulesetsRules,
  SkillsRules,
} from "./rules/index.ts";

/**
 * What a ruleset writes, one set of effects per area: each says what to write, and the service writes it in its
 * transaction (`server/services/rulesets/effectWrites.ts`).
 */
export interface ModuleEffects {
  classes: ClassesEffects;
  classLevels: ClassLevelsEffects;
  feats: FeatsEffects;
  items: ItemsEffects;
  powers: PowersEffects;
  races: RacesEffects;
  rulesets: RulesetsEffects;
  skills: SkillsEffects;
}

/** What a ruleset answers the services without the database, one set of rules per area. */
export interface ModuleRules {
  aptitudes: AptitudesRules;
  classes: ClassesRules;
  classLevels: ClassLevelsRules;
  feats: FeatsRules;
  inventory: InventoryRules;
  items: ItemsRules;
  levels: LevelsRules;
  powers: PowersRules;
  races: RacesRules;
  rulesets: RulesetsRules;
  skills: SkillsRules;
}
