import type { RulesetData } from "@/server/cache/rulesetCache/index.ts";
import type { ItemLocation } from "@/shared/enums.ts";

/** The rules a ruleset's aptitudes follow. */
export interface AptitudesRules {
  /**
   * Throws when the ruleset's characters need the aptitude by its name and the change drops it: a rename to `name`, or,
   * without one, a delete.
   */
  validateNameKept(aptitude: { name: string }, name?: string): void;
}

/** The rules a class follows. */
export interface ClassesRules {
  /** The ids of the rows that hold a class's fields: what the class page edits them through. */
  getPropertyIds(properties: { id: string; type: string }[]): Record<keyof ClassFields, string | null>;
  readProperties(properties: { type: string; value: string }[]): ClassFields;
}

/** A class's fields its properties hold: the ability its bonus spells and spell DCs use, and the spells it casts. */
export type ClassFields = { bonusSpellAbilityId: string | null; casterType: "Arcane" | "Divine" | null };

/** A class level's fields its properties hold: its base attack bonus and its skill points. */
export type ClassLevelFields = { bab: number; skills: number };

/** The rules a class level follows: its base attack and skill points, and the spells and feat pools its table shows. */
export interface ClassLevelsRules {
  enrichWithFeatPools<T extends { id: string; level: number }>(
    levels: T[],
    modifiers: { operator: string; sourceId: string; target: string; value: string }[],
    aptitudes: { name: string }[],
  ): (T & { featPools: Record<string, number> })[];
  enrichWithProperties<T extends { id: string }>(
    levels: T[],
    properties: { entityId: string; type: string; value: string }[],
  ): (T & ClassLevelFields)[];
  enrichWithSpellsKnown<T extends { id: string; level: number }>(
    levels: T[],
    modifiers: { operator: string; sourceId: string; target: string; value: string }[],
  ): (T & { spellsKnown: Record<number, number | "All"> })[];
  enrichWithSpellsPerDay<T extends { id: string; level: number }>(
    levels: T[],
    modifiers: { operator: string; sourceId: string; target: string; value: string }[],
  ): (T & { spellsPerDay: Record<number, number> })[];
  /**
   * The spell lists a class's levels give slots in, by their aptitudes' ids: the one named for the class first, then
   * the others by level; none when they give none.
   */
  getSpellListIds(
    rulesetData: Pick<RulesetData, "klassesById" | "klassLevelsByKlassId" | "modifiersBySource" | "aptitudeIdBySlug">,
    klassId: string,
  ): string[];
  readProperties(properties: { type: string; value: string }[]): ClassLevelFields;
}

/**
 * A feat's fields its properties hold: the families it's in, the weapon rules it changes, and the spell schools it
 * forbids (a specialist wizard's).
 */
export type FeatFields = {
  families: string[];
  oversizedTwoWeaponFighting: boolean;
  prohibitedSchools: string[];
  weaponFinesse: boolean;
};

/** The rules a feat follows. */
export interface FeatsRules {
  readProperties(properties: { type: string; value: string }[]): FeatFields;
}

/** The rules a character's inventory follows. */
export interface InventoryRules {
  /**
   * Whether a weapon is too large for one hand without training (a bastard sword): held there, it takes its proficiency,
   * which the equip check reads of the character.
   */
  isUnwieldyInOneHand(rulesetData: RulesetData, itemId: string): boolean;
  /** Refuses an item held in a hand slot it can't be wielded in: a two-handed weapon in one hand. */
  validateWeaponHands(rulesetData: RulesetData, itemId: string, location: string): void;
}

/**
 * An item's fields its properties hold, as stored: each null (or empty) without its row, so an item made from a
 * template holds only the fields it overrides, and what the engine does without one (a critical of 1, Strength to
 * damage by the hand) stays where the engine reads it.
 */
export type ItemFields = {
  armor: ProtectionFields;
  /** `ITEM_HAS_CHARGES`: the charges it comes with, null for an item without charges. */
  charges: number | null;
  /** `ARMOR_CHECK_PENALTY`: an armor's or a shield's. */
  checkPenalty: number | null;
  madeOf: string | null;
  magicAuras: string[];
  magicCasterLevel: number | null;
  masterwork: boolean | null;
  /** `ARMOR_MAX_DEX`: an armor's, or a tower shield's. */
  maxDex: number | null;
  shield: ProtectionFields;
  spellFailure: number | null;
  weapon: WeaponFields;
};

/** The rules an item follows. */
export interface ItemsRules {
  /** An item's fields, off its rows merged with its template's (`RulesetData.itemProperties`). */
  readProperties(properties: { type: string; value: string }[]): ItemFields;
  resolveSlot(itemType: string | null | undefined, requestedSlot: ItemLocation | undefined): ItemLocation | undefined;
}

/** The rules a character's levels follow. */
export interface LevelsRules {
  isAbilityIncreaseLevel(totalLevel: number): boolean;
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

/** A power's fields its properties hold: a spell's school, components, range… */
export interface PowerFields {
  areaOfEffect?: string;
  castingTime?: string;
  components?: string[];
  descriptors?: string[];
  duration?: string;
  rangeType?: string;
  school?: string;
  spellResistance?: string;
  subschool?: string;
  target?: string;
}

/** The rules a power follows: how it's grouped (a spell's school). */
export interface PowersRules {
  extractGroupingValue(fields: PowerFields): string | null;
  readProperties(properties: { type: string; value: string }[]): PowerFields;
}

/** An armor's or a shield's own fields: its AC bonus, the proficiency it takes and its type. */
export type ProtectionFields = { acBonus: number | null; proficiency: string | null; type: string | null };

/** A race's fields its properties hold: whether it walks on four legs, and whether armor and load leave its speed. */
export type RaceFields = { quadruped: boolean; speedIgnoresEncumbrance: boolean };

/** The rules a race follows. */
export interface RacesRules {
  readProperties(properties: { type: string; value: string }[]): RaceFields;
}

/** A ruleset's own fields its properties hold: the ability its characters' skill points come from. */
export type RulesetFields = { skillPointAbilityId: string | null };

/** The rules a ruleset follows about itself. */
export interface RulesetsRules {
  readProperties(properties: { type: string; value: string }[]): RulesetFields;
}

/** A skill's fields its properties hold: whether armor weighs on it, how many times over, and untrained use. */
export type SkillFields = { checkPenaltyMultiplier: number; impactedByWeight: boolean; usableWithoutTraining: boolean };

/** The rules a skill follows. */
export interface SkillsRules {
  enrichWithProperties<T extends { id: string }>(
    skills: T[],
    properties: { entityId: string; type: string; value: string }[],
  ): (T & SkillFields)[];
  /** The fields as a skill keeps them, which `SkillsEffects.syncProperties` stores. */
  normalizeFields(fields: SkillFields): SkillFields;
  readProperties(properties: { type: string; value: string }[]): SkillFields;
}

/** A weapon's fields: what its attacks, its groupings and the hands it's held in read. */
export type WeaponFields = {
  baseDamage: string | null;
  criticalMultiplier: number | null;
  criticalRange: number | null;
  damageTypes: string[];
  doubleDamage: string | null;
  family: string | null;
  finessable: boolean | null;
  mighty: number | null;
  oneHandedPenalty: number | null;
  oneHandTraining: boolean | null;
  proficiency: string | null;
  range: number | null;
  ranged: boolean | null;
  reach: number | null;
  size: string | null;
  strengthDamage: string | null;
  type: string | null;
};
