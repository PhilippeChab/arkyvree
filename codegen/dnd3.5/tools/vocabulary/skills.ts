/** The skills, as the books name them, and the slug each is in a target path. */

import { SKILL_NAMES } from "@/content/dnd3.5/data/skills.ts";
import { stripSeparators } from "@/shared/text.ts";

/** The Knowledge skills, as the books name them ("Knowledge (Arcana)"…), in the skill list's order. */
export const KNOWLEDGE_SKILLS = SKILL_NAMES.filter((name) => name.startsWith("Knowledge"));

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
