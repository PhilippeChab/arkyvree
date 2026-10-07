/** The three saves, as the books name them, and the slug each is in a target path. */

import { stripSeparators } from "@/shared/text.ts";

/** The three saves, as the books name them. */
export const SAVE_NAMES = ["Fortitude", "Reflex", "Will"];

/** A save's slug by its name, lowercased, or with "saving" after it ("fortitude saving" → "fortitude"). */
export const SAVE_SLUGS: Record<string, string> = Object.fromEntries(
  SAVE_NAMES.flatMap((name) => [
    [name.toLowerCase(), stripSeparators(name)],
    [`${name.toLowerCase()} saving`, stripSeparators(name)],
  ]),
);
