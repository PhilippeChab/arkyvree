/**
 * The classes' rules' numbers, as the SRD 5.2.1 gives them: the Character Advancement table (each level's experience
 * points and Proficiency Bonus), the hit dice and the fixed hit points a level gives, the level a subclass is picked
 * at, and the score a multiclass needs in its classes' primary abilities.
 */

/** A class's caster type: how its levels count toward a multiclassed character's spell slots. */
export type CasterType = (typeof CASTER_TYPES)[number];

/**
 * The caster types a class is of, as the multiclassing rules count their levels toward its spell slots: all of a full
 * caster's (a bard, a cleric, a druid, a sorcerer, a wizard), half a half caster's, rounded up (a paladin, a ranger);
 * a warlock's Pact Magic slots are its own, and a class that casts no spells counts none.
 */
export const CASTER_TYPES = ["Full", "Half", "Pact", "None"] as const;

/** The hit die a new class has when its form gives none. */
export const DEFAULT_HIT_DIE = 8;

/**
 * The experience points each character level is reached at, by level (index 0 is level 1), as the Character
 * Advancement table gives them.
 */
export const EXPERIENCE_BY_LEVEL = [
  0, 300, 900, 2700, 6500, 14000, 23000, 34000, 48000, 64000, 85000, 100000, 120000, 140000, 165000, 195000, 225000,
  265000, 305000, 355000,
] as const;

/**
 * The hit points a level after the first gives in place of a roll, by its class's hit die, as the Fixed Hit Points by
 * Class table gives them: half the die, plus 1 (a d10's 6). A character's first level gives its die's highest.
 */
export const FIXED_HIT_POINTS_BY_DIE: Readonly<Record<number, number>> = { 6: 4, 8: 5, 10: 6, 12: 7 };

/** Each hit die's name, as dice notation writes it, by its place among `HIT_DIE_VALUES`. */
export const HIT_DIE_LABELS = ["d6", "d8", "d10", "d12"] as const;

/** The dice a class's levels roll for hit points: the SRD's classes roll a d6 to a d12. */
export const HIT_DIE_VALUES = [6, 8, 10, 12] as const;

/**
 * The 2024 rules' word "Level", in each of its uses: a class level's position along its class ("Level 3"), a
 * character's level, and a spell's level, its tier.
 */
export const LEVEL_WORD = { many: "Levels", one: "Level" } as const;

/** The highest character level. */
export const MAX_CHARACTER_LEVEL = 20;

/** The highest class level. */
export const MAX_CLASS_LEVEL = 20;

/** The most picks in a pool, or spells at a spell level, a class's table gives by a level: a bound of the app's. */
export const MAX_TABLE_COUNT = 99;

/** The fewest hit points a level gives, whatever its Constitution: 1. */
export const MIN_HIT_POINTS_PER_LEVEL = 1;

/**
 * The score a character needs in the primary ability of a class it multiclasses into, and of each class it has: 13
 * (in one of them, for a class whose primary abilities are alternatives: a fighter's Strength or Dexterity).
 */
export const MULTICLASS_ABILITY_MINIMUM = 13;

/**
 * The Proficiency Bonus by character level (index 0 is level 1), as the Character Advancement table gives it: +2 at
 * level 1, one more every fourth level, +6 at level 17.
 */
export const PROFICIENCY_BONUS_BY_LEVEL = [2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 6, 6, 6, 6] as const;

/** The class level every class picks its subclass at: 3. */
export const SUBCLASS_LEVEL = 3;
