/**
 * The six abilities, as the SRD 5.2.1 names them, and their scores' numbers: a modifier is the score less 10, halved,
 * rounded down; a score is at most 30. A background's increase or a feat's takes it to 20 at most, but an Epic Boon's,
 * which takes it to 30.
 */

/** What an ability's score, less its offset, is halved by into its modifier, rounded down. */
export const ABILITY_MODIFIER_DIVISOR = 2;
/** The score an ability's modifier is 0 at. */
export const ABILITY_MODIFIER_OFFSET = 10;
/** The six abilities, as the SRD names them, in its order. */
export const ABILITY_NAMES = ["Strength", "Dexterity", "Constitution", "Intelligence", "Wisdom", "Charisma"];
/** The highest score an ability takes: 30. */
export const MAX_ABILITY_SCORE = 30;
/** The highest score an increase raises an ability to (a background's, a feat's but an Epic Boon's): 20. */
export const MAX_INCREASED_ABILITY_SCORE = 20;
/** The lowest score a character's ability takes. */
export const MIN_ABILITY_SCORE = 1;
/** The score a new character's ability has before one is rolled or set. */
export const STARTING_ABILITY_SCORE = 10;
