import type { Character as CharacterRecord } from "@/shared/relations.ts";

import { Dnd35AptitudesRules } from "./aptitudes/Dnd35AptitudesRules.ts";
import { createCharacter } from "./character/buildCharacter.ts";
import { Dnd35ClassesEffects } from "./classes/Dnd35ClassesEffects.ts";
import { Dnd35ClassesRules } from "./classes/Dnd35ClassesRules.ts";
import { Dnd35ClassLevelsEffects } from "./classes/Dnd35ClassLevelsEffects.ts";
import { Dnd35ClassLevelsRules } from "./classes/Dnd35ClassLevelsRules.ts";
import Dnd35PropertyTypes from "./Dnd35PropertyTypes.ts";
import Dnd35TargetPaths from "./Dnd35TargetPaths.ts";
import { Dnd35FeatsEffects } from "./feats/Dnd35FeatsEffects.ts";
import { Dnd35FeatsRules } from "./feats/Dnd35FeatsRules.ts";
import { Dnd35InventoryRules } from "./items/Dnd35InventoryRules.ts";
import { Dnd35ItemsEffects } from "./items/Dnd35ItemsEffects.ts";
import { Dnd35ItemsRules } from "./items/Dnd35ItemsRules.ts";
import { Dnd35LevelsRules } from "./levels/Dnd35LevelsRules.ts";
import { Dnd35LevelUp } from "./levelUp/Dnd35LevelUp.ts";
import { Dnd35PowersEffects } from "./powers/Dnd35PowersEffects.ts";
import { Dnd35PowersRules } from "./powers/Dnd35PowersRules.ts";
import { Dnd35RacesEffects } from "./races/Dnd35RacesEffects.ts";
import { Dnd35RacesRules } from "./races/Dnd35RacesRules.ts";
import { Dnd35Characters } from "./response/Dnd35Characters.ts";
import { Dnd35RulesetsEffects } from "./ruleset/Dnd35RulesetsEffects.ts";
import { Dnd35RulesetsRules } from "./ruleset/Dnd35RulesetsRules.ts";
import { Dnd35SkillsEffects } from "./skills/Dnd35SkillsEffects.ts";
import { Dnd35SkillsRules } from "./skills/Dnd35SkillsRules.ts";
import type { CharacterKind, Dnd35RulesetModule } from "./types.ts";

/**
 * The 3.5 rules as a ruleset module: what they answer the services and do in their transactions, characters, sheets
 * and level-ups, paths and properties.
 */
export function createRulesetModule(): Dnd35RulesetModule {
  return {
    rules: {
      aptitudes: new Dnd35AptitudesRules(),
      classes: new Dnd35ClassesRules(),
      classLevels: new Dnd35ClassLevelsRules(),
      feats: new Dnd35FeatsRules(),
      inventory: new Dnd35InventoryRules(),
      items: new Dnd35ItemsRules(),
      levels: new Dnd35LevelsRules(),
      powers: new Dnd35PowersRules(),
      races: new Dnd35RacesRules(),
      rulesets: new Dnd35RulesetsRules(),
      skills: new Dnd35SkillsRules(),
    },
    characters: new Dnd35Characters(),
    effects: {
      classes: new Dnd35ClassesEffects(),
      classLevels: new Dnd35ClassLevelsEffects(),
      feats: new Dnd35FeatsEffects(),
      items: new Dnd35ItemsEffects(),
      powers: new Dnd35PowersEffects(),
      races: new Dnd35RacesEffects(),
      rulesets: new Dnd35RulesetsEffects(),
      skills: new Dnd35SkillsEffects(),
    },

    levelUp: new Dnd35LevelUp(),

    createDetailedCharacter(record: CharacterRecord, kind: CharacterKind = "pc") {
      return createCharacter(record, kind);
    },

    createTargetPaths() {
      return new Dnd35TargetPaths();
    },

    createPropertyTypes() {
      return new Dnd35PropertyTypes();
    },
  };
}
