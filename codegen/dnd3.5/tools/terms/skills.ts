/** The slug each skill is in a target path, by the ways the books write it. */

import { stripSeparators } from "@/shared/text.ts";
import { SKILL_NAMES } from "@/vocabulary/dnd3.5/skills.ts";

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
