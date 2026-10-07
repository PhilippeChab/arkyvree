import type { Db } from "@/server/database/index.ts";
import type { Character as CharacterRecord } from "@/shared/relations.ts";

import Dnd35DetailedCharacterAnimalCompanion from "./bonded/DetailedCharacterAnimalCompanion.ts";
import type Dnd35DetailedCharacterBonded from "./bonded/DetailedCharacterBonded.ts";
import Dnd35DetailedCharacterFamiliar from "./bonded/DetailedCharacterFamiliar.ts";
import Dnd35DetailedCharacterMount from "./bonded/DetailedCharacterMount.ts";
import Dnd35DetailedCharacter from "./character/DetailedCharacter.ts";
import Dnd35LevelUpProjector from "./character/Dnd35LevelUpProjector.ts";
import { Dnd35ClassesRules } from "./classes/Dnd35ClassesRules.ts";
import { Dnd35ClassLevelsEffects } from "./classes/Dnd35ClassLevelsEffects.ts";
import { Dnd35ClassLevelsRules } from "./classes/Dnd35ClassLevelsRules.ts";
import Dnd35PropertyTypes from "./Dnd35PropertyTypes.ts";
import Dnd35TargetPaths from "./Dnd35TargetPaths.ts";
import { Dnd35InventoryRules } from "./items/Dnd35InventoryRules.ts";
import { Dnd35ItemsRules } from "./items/Dnd35ItemsRules.ts";
import { seedTemplateItems } from "./items/seedTemplateItems.ts";
import { Dnd35LevelsRules } from "./levels/Dnd35LevelsRules.ts";
import { Dnd35PowersEffects } from "./powers/Dnd35PowersEffects.ts";
import { Dnd35PowersRules } from "./powers/Dnd35PowersRules.ts";
import Dnd35DetailedCharacterSheet from "./sheet/DetailedCharacterSheet.tsx";
import { Dnd35SkillsEffects } from "./skills/Dnd35SkillsEffects.ts";
import { Dnd35SkillsRules } from "./skills/Dnd35SkillsRules.ts";
import type { CharacterKind, Dnd35RulesetModule } from "./types.ts";

function createBonded(record: CharacterRecord, kind: CharacterKind): Dnd35DetailedCharacterBonded | null {
  switch (kind) {
    case "familiar":
      return new Dnd35DetailedCharacterFamiliar(record);
    case "animalcompanion":
      return new Dnd35DetailedCharacterAnimalCompanion(record);
    case "mount":
      return new Dnd35DetailedCharacterMount(record);
    default:
      return null;
  }
}

/**
 * The 3.5 rules as a ruleset module: what they answer the services and do in their transactions, characters, sheets
 * and level-ups, paths and properties.
 */
export function createRulesetModule(): Dnd35RulesetModule {
  return {
    rules: {
      classes: new Dnd35ClassesRules(),
      classLevels: new Dnd35ClassLevelsRules(),
      inventory: new Dnd35InventoryRules(),
      items: new Dnd35ItemsRules(),
      levels: new Dnd35LevelsRules(),
      powers: new Dnd35PowersRules(),
      skills: new Dnd35SkillsRules(),
    },
    effects: {
      classLevels: new Dnd35ClassLevelsEffects(),
      powers: new Dnd35PowersEffects(),
      skills: new Dnd35SkillsEffects(),
    },

    async seedTemplateItems(tx: Db, rulesetId: string) {
      await seedTemplateItems(tx, rulesetId);
    },

    createDetailedCharacter(record: CharacterRecord, kind: CharacterKind = "pc") {
      const bonded = createBonded(record, kind);
      if (bonded) return bonded;
      return new Dnd35DetailedCharacter(record);
    },

    createLevelUpProjector(character) {
      return new Dnd35LevelUpProjector(character);
    },

    async createDetailedCharacterWithSheet(record: CharacterRecord, kind: CharacterKind = "pc") {
      const detailedCharacter = createBonded(record, kind) ?? new Dnd35DetailedCharacter(record);
      await detailedCharacter.build();
      return {
        detailedCharacter,
        CharacterSheetComponent: Dnd35DetailedCharacterSheet,
      };
    },

    createTargetPaths() {
      return new Dnd35TargetPaths();
    },

    createPropertyTypes() {
      return new Dnd35PropertyTypes();
    },
  };
}
