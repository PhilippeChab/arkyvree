/** The combat rules' numbers, and the weapon every character strikes with when its hand holds none. */

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

/** The weapon every character strikes with when its hand holds none: no item, always on the sheet. */
export const UNARMED_STRIKE = "Unarmed Strike";
