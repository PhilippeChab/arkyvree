/**
 * The combat rules' numbers, as the SRD 5.2.1 gives them: a character's Armor Class without armor, its speed by
 * default, and the categories of the armor it wears.
 */

/** The combat rules' numbers: the Armor Class without armor (before Dexterity), and the speed of a creature by default. */
export const COMBAT_RULES = {
  UNARMORED_AC_BASE: 10,
  DEFAULT_SPEED: 30,
} as const;

/** The category of the armor a character wears, lightest first: none, or the armor's category. */
export const WORN_ARMOR_CATEGORIES = ["none", "light", "medium", "heavy"] as const;
