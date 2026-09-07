import type { Character as CharacterRecord, Property } from "@/shared/relations.ts";
import type { Db } from "@/server/database/index.ts";
import { Abilities, Properties, Saves } from "@/server/repositories/index.ts";
import type { CharacterKind, DetailedCharacterWithSheet, RulesetModule } from "@/server/rulesets/types.ts";

import Dnd35DetailedCharacter from "./DetailedCharacter.ts";
import Dnd35DetailedCharacterFamiliar from "./DetailedCharacterFamiliar.ts";
import Dnd35DetailedCharacterAnimalCompanion from "./DetailedCharacterAnimalCompanion.ts";
import Dnd35DetailedCharacterMount from "./DetailedCharacterMount.ts";
import type Dnd35DetailedCharacterBonded from "./DetailedCharacterBonded.ts";
import Dnd35DetailedCharacterSheet from "./DetailedCharacterSheet.tsx";
import Dnd35LevelUpProjector from "./LevelUpProjector.ts";
import Dnd35TargetPaths from "./TargetPaths.ts";
import Dnd35PropertyTypes from "./PropertyTypes.ts";
import { createServiceHooks } from "./hooks/index.ts";
import { RULESET_SKILL_POINT_ABILITY_ID } from "./properties/index.ts";
import { seedTemplateItems } from "./seedTemplateItems.ts";

// D&D 3.5-specific type aliases
export type AnyCharacterSheetComponent = typeof Dnd35DetailedCharacterSheet;
export type Dnd35DetailedCharacterSheetComponent = typeof Dnd35DetailedCharacterSheet;

function createBonded(record: CharacterRecord, kind: CharacterKind): Dnd35DetailedCharacterBonded | null {
  switch (kind) {
    case "familiar": return new Dnd35DetailedCharacterFamiliar(record);
    case "animalcompanion": return new Dnd35DetailedCharacterAnimalCompanion(record);
    case "mount": return new Dnd35DetailedCharacterMount(record);
    default: return null;
  }
}

export function createRulesetModule(): RulesetModule {
  return {
    hooks: createServiceHooks(),

    async seedRuleset(tx: Db, rulesetId: string) {
      const createdAbilities = await Abilities.createMany(tx, [
        { name: "Strength", description: "Measures physical power and carrying capacity", rulesetId },
        { name: "Dexterity", description: "Measures agility, reflexes, and balance", rulesetId },
        { name: "Constitution", description: "Measures health, stamina, and vital force", rulesetId },
        { name: "Intelligence", description: "Measures reasoning and memory", rulesetId },
        { name: "Wisdom", description: "Measures perception and insight", rulesetId },
        { name: "Charisma", description: "Measures force of personality and leadership", rulesetId },
      ]);

      const abilityLookup = new Map(createdAbilities.map((a) => [a.name, a.id]));

      await Saves.createMany(tx, [
        { name: "Fortitude", description: "Resistance to physical threats", abilityId: abilityLookup.get("Constitution")!, rulesetId },
        { name: "Reflex", description: "Ability to dodge area attacks", abilityId: abilityLookup.get("Dexterity")!, rulesetId },
        { name: "Will", description: "Resistance to mental influence", abilityId: abilityLookup.get("Wisdom")!, rulesetId },
      ]);

      const skillPointAbilityId = abilityLookup.get("Intelligence");
      if (skillPointAbilityId) {
        await Properties.createMany(tx, [{
          entityId: rulesetId,
          entityType: "rulesets",
          type: RULESET_SKILL_POINT_ABILITY_ID,
          value: skillPointAbilityId,
        }]);
      }

      await seedTemplateItems(tx, rulesetId);
    },

    async seedTemplateItems(tx: Db, rulesetId: string) {
      await seedTemplateItems(tx, rulesetId);
    },

    async remapRulesetProperties(tx: Db, sourceProperties: Property[], newRulesetId: string, idMaps: Record<string, Record<string, string>>) {
      const skillPointAbilityProp = sourceProperties.find(
        (p) => p.type === RULESET_SKILL_POINT_ABILITY_ID,
      );
      if (skillPointAbilityProp) {
        const newAbilityId = idMaps.abilitiesIdMap?.[skillPointAbilityProp.value];
        if (newAbilityId) {
          await Properties.createMany(tx, [{
            entityId: newRulesetId,
            entityType: "rulesets",
            type: RULESET_SKILL_POINT_ABILITY_ID,
            value: newAbilityId,
          }]);
        }
      }
    },

    createDetailedCharacter(record: CharacterRecord, kind: CharacterKind = "pc") {
      const bonded = createBonded(record, kind);
      if (bonded) return bonded;
      return new Dnd35DetailedCharacter(record);
    },

    createLevelUpProjector(character) {
      return new Dnd35LevelUpProjector(character as Dnd35DetailedCharacter);
    },

    async createDetailedCharacterWithSheet(record: CharacterRecord, kind: CharacterKind = "pc") {
      const detailedCharacter = createBonded(record, kind) ?? new Dnd35DetailedCharacter(record);
      await detailedCharacter.build();
      return {
        detailedCharacter,
        CharacterSheetComponent: Dnd35DetailedCharacterSheet as DetailedCharacterWithSheet["CharacterSheetComponent"],
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
