import type { PgColumn } from "drizzle-orm/pg-core";

import {
  characterAbilitiesInCharacter,
  charactersInCharacter,
  featsAptitudesInRules,
  inventoryInCharacter,
  itemsInRules,
  klassesInRules,
  klassLevelFeatsInRules,
  klassLevelPowersInRules,
  klassLevelSavesInRules,
  klassSkillsInRules,
  languagesInCharacter,
  levelAbilityIncreasesInCharacter,
  levelFeatsInCharacter,
  levelPowersInCharacter,
  levelsInCharacter,
  levelSkillsInCharacter,
  powersAptitudesInRules,
  powersInRules,
  racesInRules,
  savesInRules,
  skillsInRules,
} from "@/drizzle/schema.ts";

import type { RulesetEntityType } from "./entityTables.ts";

/** A row naming an entity: the column holding the entity's id, and what the row belongs to. */
export interface EntityReference {
  column: PgColumn;
  owner: ReferenceOwner;
}

/** What a row names: a ruleset's entity, or a class's level, which a character's level names. */
export type ReferencedType = RulesetEntityType | "klass_levels";

/**
 * What a row naming an entity belongs to, by the column naming it. A ruleset's entity (`entityType`, `id`): the row
 * itself, the column one of its fields (`id` its own: an item's template), or a link of the entity `id` names (a feat's
 * link to a list, a class's skill). A class's level (`klassLevelId`: its grants, its saves). A character
 * (`characterId`): the character itself (`id` its own: its race), or one of its rows (an item it carries, a language, a
 * level). A character's level (`characterLevelId`): a pick, an ability increase.
 */
export type ReferenceOwner =
  | { characterId: PgColumn }
  | { characterLevelId: PgColumn }
  | { entityType: RulesetEntityType; id: PgColumn }
  | { klassLevelId: PgColumn };

/**
 * Every row that names an entity, by the entity's type: what a revert points at the source before the copy goes
 * (`EntityRevert`, a restore's and an unsubscribe's), what an unsubscribe finds the ruleset would lose
 * (`EntityReferences.findMany`) or points at what stands in place of what leaves (`findIds`, `update` given the
 * ruleset), and what an in-use check counts (`exists`). An entity's own rows aren't among them,
 * since they go with it: a feat's or a spell's links to its lists, a class's skills and levels. A customization names
 * its owner by type and id, and goes with it (`docs/persistence.md`); a property naming an ability by its id
 * (`PROPERTY_REFERENCES`) names an entity no ruleset copies or deletes.
 */
export const ENTITY_REFERENCES: Record<ReferencedType, EntityReference[]> = {
  abilities: [
    { column: savesInRules.abilityId, owner: { entityType: "saves", id: savesInRules.id } },
    { column: skillsInRules.primaryAbilityId, owner: { entityType: "skills", id: skillsInRules.id } },
    {
      column: characterAbilitiesInCharacter.abilityId,
      owner: { characterId: characterAbilitiesInCharacter.characterId },
    },
    {
      column: levelAbilityIncreasesInCharacter.abilityId,
      owner: { characterLevelId: levelAbilityIncreasesInCharacter.characterLevelId },
    },
  ],
  aptitudes: [
    { column: featsAptitudesInRules.aptitudeId, owner: { entityType: "feats", id: featsAptitudesInRules.featId } },
    { column: powersAptitudesInRules.aptitudeId, owner: { entityType: "powers", id: powersAptitudesInRules.powerId } },
    { column: klassLevelFeatsInRules.aptitudeId, owner: { klassLevelId: klassLevelFeatsInRules.klassLevelId } },
    { column: klassLevelPowersInRules.aptitudeId, owner: { klassLevelId: klassLevelPowersInRules.klassLevelId } },
    { column: levelFeatsInCharacter.aptitudeId, owner: { characterLevelId: levelFeatsInCharacter.characterLevelId } },
    { column: levelPowersInCharacter.aptitudeId, owner: { characterLevelId: levelPowersInCharacter.characterLevelId } },
  ],
  feats: [
    { column: klassLevelFeatsInRules.featId, owner: { klassLevelId: klassLevelFeatsInRules.klassLevelId } },
    { column: levelFeatsInCharacter.featId, owner: { characterLevelId: levelFeatsInCharacter.characterLevelId } },
  ],
  items: [
    { column: itemsInRules.sourceItemId, owner: { entityType: "items", id: itemsInRules.id } },
    { column: inventoryInCharacter.itemId, owner: { characterId: inventoryInCharacter.characterId } },
  ],
  klass_levels: [{ column: levelsInCharacter.klassLevelId, owner: { characterId: levelsInCharacter.characterId } }],
  klasses: [{ column: klassesInRules.parentId, owner: { entityType: "klasses", id: klassesInRules.id } }],
  languages: [{ column: languagesInCharacter.languageId, owner: { characterId: languagesInCharacter.characterId } }],
  mechanics: [],
  powers: [
    { column: klassLevelPowersInRules.powerId, owner: { klassLevelId: klassLevelPowersInRules.klassLevelId } },
    { column: levelPowersInCharacter.powerId, owner: { characterLevelId: levelPowersInCharacter.characterLevelId } },
  ],
  races: [
    { column: racesInRules.parentId, owner: { entityType: "races", id: racesInRules.id } },
    { column: charactersInCharacter.raceId, owner: { characterId: charactersInCharacter.id } },
  ],
  saves: [
    { column: powersInRules.saveId, owner: { entityType: "powers", id: powersInRules.id } },
    { column: klassLevelSavesInRules.saveId, owner: { klassLevelId: klassLevelSavesInRules.klassLevelId } },
  ],
  skills: [
    { column: klassSkillsInRules.skillId, owner: { entityType: "klasses", id: klassSkillsInRules.klassId } },
    { column: levelSkillsInCharacter.skillId, owner: { characterLevelId: levelSkillsInCharacter.characterLevelId } },
  ],
};
