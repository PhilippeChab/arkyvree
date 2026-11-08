/** The words the database names things with: the abilities by their abbreviations, numbers in words. */

import { ABILITY_NAMES } from "@/vocabulary/dnd5.2/abilities.ts";

/** Each ability's name, by the abbreviation the database writes it with ("STR": Strength). */
export const ABILITY_ABBREVIATIONS: Readonly<Record<string, string>> = Object.fromEntries(
  ABILITY_NAMES.map((name) => [name.slice(0, 3).toUpperCase(), name]),
);

/** Words a dash runs into, which a hyphen breaking a word over two lines never splits off ("at a time- the most"). */
export const DASHED_WORDS = ["a", "an", "and", "but", "or", "the"];

/** A number a feature's text writes in words ("two kinds of weapons"). */
export const NUMBER_WORDS: Readonly<Record<string, number>> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6 };
