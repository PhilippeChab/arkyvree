/**
 * The rows a ruleset's entities and a character's build are read as: today's shapes, which the generic tables
 * (`rules.entities`, `entity_fields`, `entity_links`; `character.fields`, `links`, `advancements`, `advancement_picks`)
 * are read into by what each module declares of them (its storage, `RulesetModule.storage`).
 */

import type {
  advancementsInCharacter,
  campaignsInCampaign,
  charactersInCharacter,
  entitiesInRules,
  inventoryInCharacter,
  invitesInCampaign,
  modifiersInCustomization,
  playersInCampaign,
  requirementsInCustomization,
  rulesetsInRules,
  sessionsInAccount,
  usersInAccount,
} from "@/drizzle/schema.ts";

import type { Alignment, BaseRules, Gender, ItemLocation, SizeType } from "./enums.ts";

/** What every ruleset entity's row holds: its scope, its name and its description, and its timestamps. */
type EntityRow = Pick<
  typeof entitiesInRules.$inferSelect,
  "campaignId" | "createdAt" | "deletedAt" | "description" | "id" | "rulesetId" | "updatedAt"
> & { name: string };

type FeatAptitude = LinkRow & { aptitudeId: string; featId: string };

/** What a link's row holds: its timestamps (a link is never archived: `deletedAt` is always null). */
type LinkRow = Pick<EntityRow, "createdAt" | "deletedAt" | "updatedAt">;

/** A pick's row, which the pick tables held: its level, and its timestamps. */
type PickRow = LinkRow & {
  characterLevelId: string;
};

type PowerAptitude = LinkRow & { aptitudeId: string; level: number | null; powerId: string };

export type Aptitude = EntityRow;
export type Campaign = typeof campaignsInCampaign.$inferSelect;
/** A character's row, with its identity's fields and its race. */
export type Character = typeof charactersInCharacter.$inferSelect & {
  age: number | null;
  alignment: Alignment;
  deity: string | null;
  gender: Gender;
  height: string | null;
  raceId: string;
  weight: string | null;
  xp: number;
};
/** A character's score in an ability. */
export type CharacterAbility = LinkRow & { abilityId: string; characterId: string; score: number };
/** An inventory entry: an item a character holds, where, in which weapon sets, and its charges. */
export type CharacterInventory = Omit<typeof inventoryInCharacter.$inferSelect, "groups" | "itemType" | "location"> & {
  location: ItemLocation | null;
  weaponSets: number[];
};
/** A language a character speaks. */
export type CharacterLanguage = LinkRow & { characterId: string; languageId: string };
/** A character's level: an advancement in a class level, with the hit points it rolled. */
export type CharacterLevel = Pick<
  typeof advancementsInCharacter.$inferSelect,
  "characterId" | "createdAt" | "deletedAt" | "id" | "position" | "updatedAt"
> & { hp: number; klassLevelId: string };
export type Feat = EntityRow & { generated: boolean; selectable: boolean; stackable: boolean };
export type FeatWithAptitudes = Feat & {
  featsAptitudesInRules: (FeatAptitude & { aptitudesInRule: Aptitude })[];
};
export type Invite = typeof invitesInCampaign.$inferSelect;
export type Item = EntityRow & {
  costGp: string | null;
  isTemplate: boolean;
  slot: ItemLocation;
  sourceItemId: string | null;
  type: string | null;
  weight: string | null;
};
export type Klass = EntityRow & { hd: number; kind: string; parentId: string | null };
export type KlassLevel = Pick<EntityRow, "createdAt" | "deletedAt" | "id" | "updatedAt"> & {
  klassId: string;
  level: number;
};
export type KlassLevelFeat = LinkRow & {
  aptitudeId: string;
  featId: string;
  free: boolean;
  id: string;
  klassLevelId: string;
};
export type KlassLevelPower = LinkRow & { aptitudeId: string; free: boolean; klassLevelId: string; powerId: string };
export type KlassLevelSave = LinkRow & { base: number; klassLevelId: string; saveId: string };
export type KlassSkill = LinkRow & { klassId: string; skillId: string };
export type Language = EntityRow & { type: string };
/** An ability increase a character's level took. */
export type LevelAbilityIncrease = PickRow & { abilityId: string; amount: number };
/** A feat a character's level took, from a pool (`aptitudeId`). */
export type LevelFeat = PickRow & { aptitudeId: string; featId: string; id: string };
/** A spell a character's level took, from a pool (`aptitudeId`). */
export type LevelPower = PickRow & { aptitudeId: string; powerId: string };
/** The ranks a character's level put in a skill. */
export type LevelSkill = PickRow & { rank: number; skillId: string };
export type Mechanic = EntityRow;
export type Modifier = typeof modifiersInCustomization.$inferSelect;
export type Player = typeof playersInCampaign.$inferSelect;
export type Power = EntityRow & { saveEffect: string | null; saveId: string | null };
export type PowerWithAptitudes = Power & {
  powersAptitudesInRules: (PowerAptitude & { aptitudesInRule: Aptitude })[];
};
/**
 * An entity's or a ruleset's field, as its property was: its owner, its type (the field) and its value as text, a set
 * one row per value. `id` names it by its owner, its field and its value's key, which no other row shares.
 */
export type Property = LinkRow & {
  description: string | null;
  entityId: string;
  entityType: string;
  id: string;
  type: string;
  value: string;
};
export type Race = EntityRow & { baseSpeed: number; kind: string; parentId: string | null; size: SizeType };
export type Requirement = typeof requirementsInCustomization.$inferSelect;
/** A ruleset's row: its base rules, a registered module's. */
export type Ruleset = Omit<typeof rulesetsInRules.$inferSelect, "baseRules"> & { baseRules: BaseRules };
export type RulesetAbility = EntityRow & { description: string };
export type RulesetSave = EntityRow & { abilityId: string };
export type Session = typeof sessionsInAccount.$inferSelect;
export type Skill = EntityRow & { primaryAbilityId: string };
export type User = typeof usersInAccount.$inferSelect;
