/** The slug each ability is in a target path, by the ways the books write it. */

import { stripSeparators } from "@/shared/text.ts";
import { ABILITY_NAMES } from "@/vocabulary/dnd3.5/abilities.ts";

/** An ability's slug by its abbreviation, lowercased ("Str 13": "str" → "strength"). */
export const ABILITY_ABBREVIATIONS: Record<string, string> = Object.fromEntries(
  ABILITY_NAMES.map((name) => [name.slice(0, 3).toLowerCase(), stripSeparators(name)]),
);

/** An ability's slug by its name, lowercased ("strength" → "strength"). */
export const ABILITY_SLUGS: Record<string, string> = Object.fromEntries(
  ABILITY_NAMES.map((name) => [name.toLowerCase(), stripSeparators(name)]),
);
