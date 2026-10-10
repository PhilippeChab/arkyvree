/**
 * The combat rules' numbers and tables: the armor categories, the base AC and speed, the attack penalties and steps,
 * the damage dice's size progression, the Strength a slot adds to damage, and the weapon every character strikes with
 * when its hand holds none.
 */

/** The category of the armor a character wears, lightest first: none, or the armor's proficiency category. */
export const ARMOR_CATEGORIES = ["none", "light", "medium", "heavy"] as const;

/** The combat rules' numbers: the base AC and speed, and the attack penalties and steps. */
export const COMBAT_RULES = {
  DEFAULT_AC_BASE: 10,
  DEFAULT_SPEED: 30,
  NONPROFICIENCY_PENALTY: -4,
  // A composite bow's penalty to attack when the wielder's Strength bonus is below its rating
  COMPOSITE_BOW_PENALTY: -2,
  // A tower shield's penalty on attack rolls, for its encumbrance
  TOWER_SHIELD_PENALTY: -2,
  // A secondary natural attack's penalty to attack, which Multiattack lessens
  SECONDARY_NATURAL_ATTACK_PENALTY: -5,
  // Two-weapon fighting's penalties on each hand's attacks, 2 less with a light off-hand weapon (PHB Table 8-10)
  TWO_WEAPON_MAIN_HAND_PENALTY: -6,
  TWO_WEAPON_OFF_HAND_PENALTY: -10,
  LIGHT_OFF_HAND_BONUS: 2,
  // How much lower each attack after the first is, iterative or off hand
  ATTACK_STEP: 5,
} as const;

/**
 * D&D 3.5 damage die progression for size adjustments. All weapon/unarmed damages are defined for Medium size; shift up
 * for Large, down for Small, etc.
 */
export const DAMAGE_PROGRESSION = [
  "1",
  "1d2",
  "1d3",
  "1d4",
  "1d6",
  "1d8",
  "1d10",
  "2d6",
  "2d8",
  "2d10",
  "3d6",
  "3d8",
  "4d6",
  "4d8",
];

/**
 * The share of its Strength bonus a weapon adds to damage in each slot: all of it, half, or one and a half (a light
 * weapon's all of it in two hands).
 */
export const SLOT_STRENGTH_MULTIPLIERS: Record<string, number> = { "Main Hand": 1, "Off Hand": 0.5, "Two Handed": 1.5 };

/** The weapon every character strikes with when its hand holds none: no item, always on the sheet. */
export const UNARMED_STRIKE = "Unarmed Strike";
