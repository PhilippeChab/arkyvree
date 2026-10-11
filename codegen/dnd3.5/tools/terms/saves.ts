/** The slug each save is in a target path, by the ways the books write it. */

import { stripSeparators } from "@/shared/text.ts";
import { SAVE_NAMES } from "@/vocabulary/dnd3.5/saves.ts";

/** A save's slug by its name, lowercased, or with "saving" after it ("fortitude saving" → "fortitude"). */
export const SAVE_SLUGS: Record<string, string> = Object.fromEntries(
  SAVE_NAMES.flatMap((name) => [
    [name.toLowerCase(), stripSeparators(name)],
    [`${name.toLowerCase()} saving`, stripSeparators(name)],
  ]),
);
