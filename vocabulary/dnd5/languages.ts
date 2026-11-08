/**
 * The languages, as the SRD 5.2.1's tables give them: every character knows Common and picks two other standard
 * languages; a rare one comes from a feature (a druid's Druidic, a rogue's Thieves' Cant).
 */

/** The language every character knows. */
export const COMMON_LANGUAGE = "Common";

/** How many standard languages a new character picks, past Common: two. */
export const LANGUAGE_PICKS = 2;

/** The type of a rare language, which a character speaks only when a feature grants it: no pick takes one. */
export const RARE_LANGUAGE_TYPE = "Rare";

/** The rare languages, which no pick takes but a feature grants. */
export const RARE_LANGUAGES = [
  "Abyssal",
  "Celestial",
  "Deep Speech",
  "Druidic",
  "Infernal",
  "Primordial",
  "Sylvan",
  "Thieves' Cant",
  "Undercommon",
] as const;

/** The type of a standard language, which a new character's picks take. */
export const STANDARD_LANGUAGE_TYPE = "Standard";

/** The standard languages, Common first. */
export const STANDARD_LANGUAGES = [
  COMMON_LANGUAGE,
  "Common Sign Language",
  "Draconic",
  "Dwarvish",
  "Elvish",
  "Giant",
  "Gnomish",
  "Goblin",
  "Halfling",
  "Orc",
] as const;
