import { isValidModifierPath } from "@/database/packages/dnd35-from-parser/tools/scraper/paths.ts";
import {
  SKILL_MAP as BASE_SKILL_MAP,
  detectModifiersOf,
  type ModifierDetection,
  modifierMapping,
  validateModifiers,
} from "@/database/packages/dnd35-from-parser/tools/shared.ts";
import type { DomainReference } from "@/database/packages/dnd35-from-parser/tools/types.ts";
import type { Modifier } from "@/database/packages/dnd35/content/customization/types.ts";
import { SKILL_NAMES } from "@/database/packages/dnd35/data/skills.ts";
import { stripSeparators } from "@/shared/text.ts";

/** Every Knowledge skill, which "Add all Knowledge skills" names. */
const ALL_KNOWLEDGE_SKILLS = SKILL_NAMES.filter((n) => n.startsWith("Knowledge"));

/** Skill names → slugs, the base's and each without its parentheses: "Knowledge (nature)" and "knowledge nature" → "knowledgenature". */
const SKILL_MAP: Record<string, string> = {
  ...BASE_SKILL_MAP,
  ...Object.fromEntries(
    SKILL_NAMES.map((name) => [name, name.replace(/\s*\([^)]*\)\s*/, " ").trim()] as const)
      .filter(([name, noParen]) => noParen !== name)
      .map(([name, noParen]) => [noParen.toLowerCase(), stripSeparators(name)]),
  ),
};

function detectDomainModifiers(description: string): ModifierDetection<Modifier> {
  const modifiers: Modifier[] = [];
  const errors: string[] = [];
  const unresolvedModifiers: string[] = [];

  if (!description) return { modifiers, errors, unresolvedModifiers };

  // Pattern: "Add all Knowledge skills to your list of cleric class skills"
  if (/add all knowledge skills/i.test(description)) {
    for (const name of ALL_KNOWLEDGE_SKILLS) {
      const slug = stripSeparators(name);
      modifiers.push({ target: `skills.${slug}.innate`, operator: "set", value: "true", valueType: "boolean" });
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
        const slug = SKILL_MAP[name.toLowerCase()];
        if (slug) {
          modifiers.push({ target: `skills.${slug}.innate`, operator: "set", value: "true", valueType: "boolean" });
        } else {
          unresolvedModifiers.push(`Unresolved class skill: "${name}"`);
        }
      }
    }
  }

  // Validate paths
  const { validated, errors: validationErrors } = validateModifiers(modifiers, isValidModifierPath);
  errors.push(...validationErrors);

  return { modifiers: validated, errors, unresolvedModifiers };
}

export function buildDomainDetected(raw: DomainReference["raw"]): DomainReference["detected"] {
  return detectModifiersOf(raw, (entry) => detectDomainModifiers(entry.description));
}

export function buildDomainMapping(
  raw: DomainReference["raw"],
  detected: DomainReference["detected"],
  overrides: NonNullable<DomainReference["overrides"]>,
): DomainReference["mapping"] {
  return modifierMapping(raw, detected, overrides, (override?: NonNullable<DomainReference["overrides"]>[string]) =>
    override?.featPool ? { featPool: override.featPool } : {},
  );
}
