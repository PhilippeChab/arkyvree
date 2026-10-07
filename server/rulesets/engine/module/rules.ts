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
  /** Extract spellcasting-related property values from raw class properties. */
  readProperties(properties: { id: string; type: string; value: string }[]): {
    bonusSpellAbilityId: string | null;
    bonusSpellPropertyId: string | null;
    casterTypePropertyId: string | null;
    casterTypeValue: string | null;
  };
}

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

/** The rules an item follows. */
export interface ItemsRules {
  resolveSlot(itemType: string | null | undefined, requestedSlot: ItemLocation | undefined): ItemLocation | undefined;
}

/** The rules a character's levels follow. */
export interface LevelsRules {
  isAbilityIncreaseLevel(totalLevel: number): boolean;
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
  /** The property type that holds a power's grouping. */
  readonly primaryGroupingType: string;
}

/** A race's fields its properties hold: whether it walks on four legs, and whether armor and load leave its speed. */
export type RaceFields = { quadruped: boolean; speedIgnoresEncumbrance: boolean };

/** The rules a race follows. */
export interface RacesRules {
  readProperties(properties: { type: string; value: string }[]): RaceFields;
}

/** What a ruleset answers the services without the database, one set of rules per area. */
export interface RulesetRules {
  aptitudes: AptitudesRules;
  classes: ClassesRules;
  classLevels: ClassLevelsRules;
  inventory: InventoryRules;
  items: ItemsRules;
  levels: LevelsRules;
  powers: PowersRules;
  races: RacesRules;
  skills: SkillsRules;
}

/** A skill's flags, kept as its properties: whether armor weighs on it, how many times over, and untrained use. */
export type SkillFlags = { checkPenaltyMultiplier: number; impactedByWeight: boolean; usableWithoutTraining: boolean };

/** The rules a skill follows. */
export interface SkillsRules {
  enrichWithProperties<T extends { id: string }>(
    skills: T[],
    properties: { entityId: string; type: string; value: string }[],
  ): (T & SkillFlags)[];
  /** The flags as a skill keeps them, which `SkillsEffects.syncProperties` stores. */
  normalizeFlags(flags: SkillFlags): SkillFlags;
}
