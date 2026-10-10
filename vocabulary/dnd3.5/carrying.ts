/** What a creature carries: its capacity by Strength and size, its load categories and what each costs it. */

export type LoadCategory = (typeof LOAD_CATEGORIES)[number];

/**
 * D&D 3.5 PHB Table 9-1: Carrying Capacity by Strength score (index = Str score, value = heavy load in lbs)
 * Index 0 is unused (no Str 0), indices 1–29 map to Str 1–29
 */
export const CARRYING_CAPACITY: number[] = [
  0, // 0 (unused)
  10, // 1
  20, // 2
  30, // 3
  40, // 4
  50, // 5
  60, // 6
  70, // 7
  80, // 8
  90, // 9
  100, // 10
  115, // 11
  130, // 12
  150, // 13
  175, // 14
  200, // 15
  230, // 16
  260, // 17
  300, // 18
  350, // 19
  400, // 20
  460, // 21
  520, // 22
  600, // 23
  700, // 24
  800, // 25
  920, // 26
  1040, // 27
  1200, // 28
  1400, // 29
];

/** What each `CARRYING_CAPACITY_STRENGTH_STEP` of Strength past the table multiplies the carrying capacity by. */
export const CARRYING_CAPACITY_STEP_MULTIPLIER = 4;

/**
 * Past the table's Strength, how many more points of it multiply the carrying capacity
 * (`CARRYING_CAPACITY_STEP_MULTIPLIER`).
 */
export const CARRYING_CAPACITY_STRENGTH_STEP = 10;

/** D&D 3.5 reduced speed for medium/heavy encumbrance (base → reduced) */
export const ENCUMBERED_SPEED: Record<number, number> = {
  20: 15,
  30: 20,
  40: 30,
  50: 35,
  60: 40,
  70: 50,
  80: 55,
  90: 60,
  100: 70,
};

/** The thirds of its speed a medium or heavy load leaves a speed the table (`ENCUMBERED_SPEED`) doesn't list. */
export const ENCUMBERED_SPEED_THIRDS = 2;

/** Max Dex bonus and check penalty by load category */
export const ENCUMBRANCE_PENALTIES = {
  light: { maxdex: Infinity, checkpenalty: 0 },
  medium: { maxdex: 3, checkpenalty: -3 },
  heavy: { maxdex: 1, checkpenalty: -6 },
  overloaded: { maxdex: 0, checkpenalty: -6 },
} as const;

/** The thirds of the heavy load a light load is, at most. */
export const LIGHT_LOAD_THIRDS = 1;

export const LOAD_CATEGORIES = ["light", "medium", "heavy", "overloaded"] as const;

/** The thirds of the heavy load a medium load is, at most. */
export const MEDIUM_LOAD_THIRDS = 2;

/** The speed an overloaded creature moves at, whatever its own: 5 ft. */
export const OVERLOADED_SPEED = 5;

/** A quadruped's carrying capacity by size: it carries more than a biped (SRD, "Bigger and Smaller Creatures"). */
export const QUADRUPED_SIZE_CARRY_MULTIPLIERS: Record<string, number> = {
  Fine: 1 / 4,
  Diminutive: 1 / 2,
  Tiny: 3 / 4,
  Small: 1,
  Medium: 3 / 2,
  Large: 3,
  Huge: 6,
  Gargantuan: 12,
  Colossal: 24,
};

/** Multiplier applied to a biped's carrying capacity based on its size */
export const SIZE_CARRY_MULTIPLIERS: Record<string, number> = {
  Fine: 1 / 8,
  Diminutive: 1 / 4,
  Tiny: 1 / 2,
  Small: 3 / 4,
  Medium: 1,
  Large: 2,
  Huge: 4,
  Gargantuan: 8,
  Colossal: 16,
};
