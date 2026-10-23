/**
 * The rows the engine reads a ruleset's entities and a character's build as, each kind's by its module's storage
 * declaration (`StorageEngine.rowOf`, `characterLinkRowOf`, `pickRowOf`): 3.5's shapes, which the core's view still
 * names until it reads every kind alike.
 */

import type { ItemLocation, SizeType } from "@/shared/enums.ts";

/** An entity's own columns. */
interface EntityColumns {
  campaignId: string | null;
  createdAt: string;
  deletedAt: string | null;
  description: string | null;
  id: string;
  name: string;
  rulesetId: string;
  updatedAt: string;
}

type FeatAptitude = LinkRow & { aptitudeId: string; featId: string };

/** What a link's row holds: its timestamps (a link is never archived: `deletedAt` is always null). */
type LinkRow = Pick<EntityRow, "createdAt" | "deletedAt" | "updatedAt">;

/** A pick's row: its level, and its timestamps. */
type PickRow = LinkRow & {
  characterLevelId: string;
};

type PowerAptitude = LinkRow & { aptitudeId: string; level: number | null; powerId: string };

export type Aptitude = EntityRow;
/** A character's score in an ability. */
export type CharacterAbility = LinkRow & { abilityId: string; characterId: string; score: number };
/** A language a character speaks. */
export type CharacterLanguage = LinkRow & { characterId: string; languageId: string };
/** A character's level: an advancement in a class level, with the hit points it rolled. */
export type CharacterLevel = Pick<EntityRow, "createdAt" | "deletedAt" | "id" | "updatedAt"> & {
  characterId: string;
  hp: number;
  klassLevelId: string;
  position: number;
};
/**
 * What every ruleset entity's row holds: its scope, its name and its description, and its timestamps. A mapped type, as
 * a row's answer is plain data any record type takes (an interface isn't).
 */
export type EntityRow = Pick<EntityColumns, keyof EntityColumns>;

export type Feat = EntityRow & { generated: boolean; selectable: boolean; stackable: boolean };
export type FeatWithAptitudes = Feat & {
  featsAptitudesInRules: (FeatAptitude & { aptitudesInRule: Aptitude })[];
};
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
export type Power = EntityRow & { saveEffect: string | null; saveId: string | null };
export type PowerWithAptitudes = Power & {
  powersAptitudesInRules: (PowerAptitude & { aptitudesInRule: Aptitude })[];
};
export type Race = EntityRow & { baseSpeed: number; kind: string; parentId: string | null; size: SizeType };
export type RulesetAbility = EntityRow & { description: string };
export type RulesetSave = EntityRow & { abilityId: string };
export type Skill = EntityRow & { primaryAbilityId: string };
