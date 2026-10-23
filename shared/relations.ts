import type {
  campaignsInCampaign,
  charactersInCharacter,
  invitesInCampaign,
  modifiersInCustomization,
  playersInCampaign,
  requirementsInCustomization,
  rulesetsInRules,
  sessionsInAccount,
  usersInAccount,
} from "@/drizzle/schema.ts";
import type { Alignment, BaseRules, Gender, ItemLocation, SizeType } from "@/shared/enums.ts";

/**
 * The rows a ruleset's entities and a character's build are read as: today's shapes, which the generic tables
 * (`rules.entities`, `entity_fields`, `entity_links`; `character.fields`, `links`, `advancements`, `advancement_picks`)
 * are read into by what each module declares of them (its storage, `RulesetModule.storage`).
 */

/** What every ruleset entity's row holds: its scope, its name and its description, and its timestamps. */
type EntityRow = {
  campaignId: string | null;
  createdAt: string;
  deletedAt: string | null;
  description: string | null;
  id: string;
  name: string;
  rulesetId: string;
  updatedAt: string;
};

/** What a link's row holds: its timestamps (a link is never archived: `deletedAt` is always null). */
type LinkRow = {
  createdAt: string;
  deletedAt: string | null;
  updatedAt: string;
};

/** A pick's row, which the pick tables held: its level, and its timestamps. */
type PickRow = LinkRow & {
  characterLevelId: string;
};

type FeatAptitude = LinkRow & { aptitudeId: string; featId: string };

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
export type CharacterInventory = {
  characterId: string;
  createdAt: string;
  deletedAt: string | null;
  equipped: boolean;
  id: string;
  itemId: string;
  location: ItemLocation | null;
  quantity: number;
  remainingCharges: number | null;
  totalCharges: number | null;
  updatedAt: string;
  weaponSets: number[];
};
/** A language a character speaks. */
export type CharacterLanguage = LinkRow & { characterId: string; languageId: string };
/** A character's level: an advancement in a class level, with the hit points it rolled. */
export type CharacterLevel = {
  characterId: string;
  createdAt: string;
  deletedAt: string | null;
  hp: number;
  id: string;
  klassLevelId: string;
  position: number;
  updatedAt: string;
};
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
export type KlassLevel = {
  createdAt: string;
  deletedAt: string | null;
  id: string;
  klassId: string;
  level: number;
  updatedAt: string;
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
export type Property = {
  createdAt: string;
  deletedAt: string | null;
  description: string | null;
  entityId: string;
  entityType: string;
  id: string;
  type: string;
  updatedAt: string;
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
