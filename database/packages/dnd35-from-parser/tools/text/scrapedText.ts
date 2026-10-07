/** The scraped text, cleaned as the seeds store it. */

import { sanitizeText } from "./sanitize.ts";

const WEAPON_DESC_PATTERNS = [/the selected weapon/gi, /selected weapon/gi, /the weapon you selected/gi];

export const MAX_DESC = 2000;

export const NUMBER_WORDS: Record<string, number> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
};

/**
 * The separator a scraped text keeps between its parts (a race's traits): U+2063 INVISIBLE SEPARATOR, which
 * `normalizeWs` keeps, as it would not a line break.
 */
export const PART_SEPARATOR = "\u2063";

export function expandTemplateDescription(description: string, type: string, item: string): string {
  if (type === "weapon" || type === "crossbow")
    return WEAPON_DESC_PATTERNS.reduce((text, pattern) => text.replace(pattern, item), description);

  if (type === "skill") return description.replace(/that skill|\{skill\}/gi, item);

  if (type === "school") return description.replace(/\{school\}/g, item);

  return description;
}

export function normalizeDescription(text: string, maxLen = MAX_DESC): string {
  const clean = normalizeWs(sanitizeText(text));
  return clean.length > maxLen ? clean.substring(0, maxLen - 3).trim() + "..." : clean;
}

/** Text with its runs of whitespace (newlines included) as single spaces, trimmed. */
export function normalizeWs(text: string) {
  return text.replace(/\s+/g, " ").trim();
}
