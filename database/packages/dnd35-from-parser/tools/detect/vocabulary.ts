/**
 * The names the books give abilities, saves, skills and races, and what each is in a target path: its slug, or the
 * path a requirement checks.
 */

import { SKILL_NAMES } from "@/database/packages/dnd35/data/skills.ts";
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

/** The character's race's name, which a race prerequisite checks. */
export const RACE_NAME_PATH = "identity.physiology.race.name";

/** The character's race's size, which a size prerequisite checks. */
export const RACE_SIZE_PATH = "identity.physiology.race.size";

/** The three saves, as the books name them. */
export const SAVE_NAMES = ["Fortitude", "Reflex", "Will"];

/** A save's slug by its name, lowercased, or with "saving" after it ("fortitude saving" → "fortitude"). */
export const SAVE_SLUGS: Record<string, string> = Object.fromEntries(
  SAVE_NAMES.flatMap((name) => [
    [name.toLowerCase(), stripSeparators(name)],
    [`${name.toLowerCase()} saving`, stripSeparators(name)],
  ]),
);

/** A skill's slug by its name, lowercased ("knowledge (arcana)" → "knowledgearcana"). */
export const SKILL_SLUGS: Record<string, string> = Object.fromEntries(
  SKILL_NAMES.map((name) => [name.toLowerCase(), stripSeparators(name)]),
);

/**
 * A skill's slug: its own ("Knowledge (arcana)" → "knowledgearcana"), else its base skill's, for a specialization the
 * skill list doesn't name ("Perform (dance)" → "perform").
 */
export function toSkillSlug(name: string): string {
  const fullKey = name.toLowerCase().trim();
  if (SKILL_SLUGS[fullKey]) return SKILL_SLUGS[fullKey];
  const baseName = name
    .replace(/\s*\([^)]*\)\s*$/, "")
    .toLowerCase()
    .trim();
  return SKILL_SLUGS[baseName] ?? stripSeparators(baseName);
}
