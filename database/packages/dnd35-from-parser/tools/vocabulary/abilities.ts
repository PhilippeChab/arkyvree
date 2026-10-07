/** The six abilities, as the books name them, and the slug each is in a target path. */

import { stripSeparators } from "@/shared/text.ts";

/** The six abilities, as the books name them. */
export const ABILITY_NAMES = ["Strength", "Dexterity", "Constitution", "Intelligence", "Wisdom", "Charisma"];

/** An ability's slug by its abbreviation, lowercased ("Str 13": "str" → "strength"). */
export const ABILITY_ABBREVIATIONS: Record<string, string> = Object.fromEntries(
  ABILITY_NAMES.map((name) => [name.slice(0, 3).toLowerCase(), stripSeparators(name)]),
);

/** An ability's slug by its name, lowercased ("strength" → "strength"). */
export const ABILITY_SLUGS: Record<string, string> = Object.fromEntries(
  ABILITY_NAMES.map((name) => [name.toLowerCase(), stripSeparators(name)]),
);
