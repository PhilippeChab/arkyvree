export const CONSTANTS = {
  DEFAULT_ABILITY_SCORE: 10,
  DEFAULT_AC_BASE: 10,
  DEFAULT_SPEED: 30,
  ABILITY_MODIFIER_DIVISOR: 2,
  ABILITY_MODIFIER_OFFSET: 10,
  NONPROFICIENCY_PENALTY: -4,
} as const;

// D&D 3.5 PHB Table 9-1: Carrying Capacity by Strength score (index = Str score, value = heavy load in lbs)
// Index 0 is unused (no Str 0), indices 1–29 map to Str 1–29
export const CARRYING_CAPACITY: number[] = [
  0,     // 0 (unused)
  10,    // 1
  20,    // 2
  30,    // 3
  40,    // 4
  50,    // 5
  60,    // 6
  70,    // 7
  80,    // 8
  90,    // 9
  100,   // 10
  115,   // 11
  130,   // 12
  150,   // 13
  175,   // 14
  200,   // 15
  230,   // 16
  260,   // 17
  300,   // 18
  350,   // 19
  400,   // 20
  460,   // 21
  520,   // 22
  600,   // 23
  700,   // 24
  800,   // 25
  920,   // 26
  1040,  // 27
  1200,  // 28
  1400,  // 29
];

// Multiplier applied to carrying capacity based on creature size
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

// Weapon damage size step (Medium = 0; +1 step = bigger damage die).
export const SIZE_STEPS: Record<string, number> = {
  Fine: -4, Diminutive: -3, Tiny: -2, Small: -1, Medium: 0, Large: 1, Huge: 2, Gargantuan: 3, Colossal: 4,
};

// Size modifier applied to grapple checks (opposite direction to AC/attack).
export const SIZE_GRAPPLE_MOD: Record<string, number> = {
  Fine: -16, Diminutive: -12, Tiny: -8, Small: -4, Medium: 0, Large: 4, Huge: 8, Gargantuan: 12, Colossal: 16,
};

// Size modifier applied to AC and to-hit (same magnitude, same direction).
export const SIZE_AC_ATTACK_MOD: Record<string, number> = {
  Fine: 8, Diminutive: 4, Tiny: 2, Small: 1, Medium: 0, Large: -1, Huge: -2, Gargantuan: -4, Colossal: -8,
};

// Size modifier applied to the Hide skill (opposite direction to AC/attack).
export const SIZE_HIDE_MOD: Record<string, number> = {
  Fine: 16, Diminutive: 12, Tiny: 8, Small: 4, Medium: 0, Large: -4, Huge: -8, Gargantuan: -12, Colossal: -16,
};

// Max Dex bonus and check penalty by load category
export const ENCUMBRANCE_PENALTIES = {
  light: { maxdex: Infinity, checkpenalty: 0 },
  medium: { maxdex: 3, checkpenalty: -3 },
  heavy: { maxdex: 1, checkpenalty: -6 },
  overloaded: { maxdex: 0, checkpenalty: -6 },
} as const;

// D&D 3.5 reduced speed for medium/heavy encumbrance (base → reduced)
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

export type LoadCategory = "light" | "medium" | "heavy" | "overloaded";
