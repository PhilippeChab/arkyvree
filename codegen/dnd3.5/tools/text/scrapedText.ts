/** The scraped text, cleaned as the seeds store it. */

import { normalizeWs } from "@/codegen/core/text/whitespace.ts";

import { sanitizeText } from "./sanitize.ts";

/**
 * How a weapon template's text names its weapon, in lower case but where a sentence opens: a capital "Weapon" is a
 * feat's name ("a slashing weapon for which you have selected Weapon Focus": Disemboweling Strike), not the weapon.
 */
const WEAPON_DESC_PATTERNS = [/[Tt]he selected weapon/g, /[Ss]elected weapon/g, /[Tt]he weapon you selected/g];

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

/** A description as the seeds store it: the scraped text sanitized and its whitespace normalized, whole. */
export function normalizeDescription(text: string): string {
  return normalizeWs(sanitizeText(text));
}
