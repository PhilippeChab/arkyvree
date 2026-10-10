import { SKILL_SLUGS } from "@/codegen/dnd3.5/tools/terms/skills.ts";
import { setFlag } from "@/content/core/builders/customization/modifiers.ts";
import type { Modifier } from "@/content/core/builders/customization/types.ts";
import { stripSeparators } from "@/shared/text.ts";
import { KNOWLEDGE_SKILLS, SKILL_NAMES } from "@/vocabulary/dnd3.5/skills.ts";

import { ModifierReading } from "./ModifierReading.ts";

/**
 * Skill names → slugs, as a domain names them: by name, or without its parentheses ("Knowledge (nature)" and
 * "knowledge nature" → "knowledgenature").
 */
const DOMAIN_SKILL_SLUGS: Record<string, string> = {
  ...SKILL_SLUGS,
  ...Object.fromEntries(
    SKILL_NAMES.map((name) => [name, name.replace(/\s*\([^)]*\)\s*/, " ").trim()] as const)
      .filter(([name, noParen]) => noParen !== name)
      .map(([name, noParen]) => [noParen.toLowerCase(), stripSeparators(name)]),
  ),
};

/** The modifiers a domain's granted power gives: the skills it adds to the cleric's class skills. */
export class DomainModifiers extends ModifierReading<Modifier> {
  constructor(description: string) {
    super();
    if (!description) return;

    // Pattern: "Add all Knowledge skills to your list of cleric class skills"
    if (/add all knowledge skills/i.test(description)) {
      for (const name of KNOWLEDGE_SKILLS) {
        const slug = stripSeparators(name);
        this.modifiers.push(setFlag(`skills.${slug}.innate`));
      }
    }

    // Pattern: "Add X to your list of cleric class skills"
    // Also: "Add X, Y, and Z to your list of cleric class skills"
    const addSkillMatch = description.match(/[Aa]dd\s+(.+?)\s+to your list of cleric class skills/);
    if (addSkillMatch) {
      const skillText = addSkillMatch[1];

      // Skip "all Knowledge skills" — handled above
      if (!/^all knowledge skills$/i.test(skillText)) {
        // Split on ", " and " and "
        const parts = skillText.split(/,\s*(?:and\s+)?|\s+and\s+/);
        for (const part of parts) {
          const name = part.trim();
          if (!name) continue;
          const slug = DOMAIN_SKILL_SLUGS[name.toLowerCase()];
          if (slug) this.modifiers.push(setFlag(`skills.${slug}.innate`));
          else this.unresolved.push(`Unresolved class skill: "${name}"`);
        }
      }
    }

    this.keepValidModifiers();
  }
}
