/** The words a Core Rulebook feat's page names things with: its abilities, its numbers, other feats by other names. */

import { ABILITY_NAMES } from "@/vocabulary/pf1/abilities.ts";

/** Each ability's path segment, by the abbreviation a prerequisite writes it with ("Str 13": strength). */
export const ABILITY_ABBREVIATIONS: Readonly<Record<string, string>> = Object.fromEntries(
  ABILITY_NAMES.map((name) => [name.slice(0, 3).toLowerCase(), name.toLowerCase()]),
);

/** The feats a prerequisite names otherwise than by their titles ("Light Armor Proficiency"), by their titles. */
export const FEAT_SYNONYMS: Readonly<Record<string, string>> = {
  "Heavy Armor Proficiency": "Armor Proficiency, Heavy",
  "Light Armor Proficiency": "Armor Proficiency, Light",
  "Medium Armor Proficiency": "Armor Proficiency, Medium",
};

/** A number a prerequisite writes in words ("any two critical feats"). */
export const NUMBER_WORDS: Readonly<Record<string, number>> = { one: 1, two: 2, three: 3, four: 4 };
