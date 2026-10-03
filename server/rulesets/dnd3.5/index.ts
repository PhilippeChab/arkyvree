import type { Db } from "@/server/database/index.ts";
import { Properties } from "@/server/repositories/index.ts";
import type { CharacterKind, DetailedCharacterWithSheet, RulesetModule } from "@/server/rulesets/types.ts";
import type { Character as CharacterRecord, Property } from "@/shared/relations.ts";

import Dnd35DetailedCharacter from "./DetailedCharacter.ts";
import Dnd35DetailedCharacterAnimalCompanion from "./DetailedCharacterAnimalCompanion.ts";
import type Dnd35DetailedCharacterBonded from "./DetailedCharacterBonded.ts";
import Dnd35DetailedCharacterFamiliar from "./DetailedCharacterFamiliar.ts";
import Dnd35DetailedCharacterMount from "./DetailedCharacterMount.ts";
import { createServiceHooks } from "./hooks/index.ts";
import Dnd35LevelUpProjector from "./LevelUpProjector.ts";
import { RULESET_SKILL_POINT_ABILITY_ID } from "./properties/index.ts";
import Dnd35PropertyTypes from "./PropertyTypes.ts";
import { seedTemplateItems } from "./seedTemplateItems.ts";
import Dnd35DetailedCharacterSheet from "./sheet/DetailedCharacterSheet.tsx";
import Dnd35TargetPaths from "./TargetPaths.ts";

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

export function createRulesetModule(): RulesetModule {
  return {
    hooks: createServiceHooks(),

    async seedTemplateItems(tx: Db, rulesetId: string) {
      await seedTemplateItems(tx, rulesetId);
    },

    async remapRulesetProperties(
      tx: Db,
      sourceProperties: Property[],
      newRulesetId: string,
      idMaps: Record<string, Record<string, string>>,
    ) {
      const skillPointAbilityProp = sourceProperties.find((p) => p.type === RULESET_SKILL_POINT_ABILITY_ID);
      if (skillPointAbilityProp) {
        const newAbilityId = idMaps.abilitiesIdMap?.[skillPointAbilityProp.value];
        if (newAbilityId) {
          await Properties.createMany(tx, [
            {
              entityId: newRulesetId,
              entityType: "rulesets",
              type: RULESET_SKILL_POINT_ABILITY_ID,
              value: newAbilityId,
            },
          ]);
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
