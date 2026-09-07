import { stripSeparators } from "@/shared/utils.ts";
import type { ModifierSeed } from "@/database/packages/dnd35/v1/feats/types.ts";
import { SKILL_NAMES } from "@/database/packages/dnd35/v1/feats/skills.ts";
import { isValidModifierPath } from "@/database/packages/dnd35-from-parser/tools/scraper/paths.ts";
import type { DomainReference } from "@/database/packages/dnd35-from-parser/tools/types.ts";
import { SKILL_MAP as BASE_SKILL_MAP, validateModifiers } from "@/database/packages/dnd35-from-parser/tools/shared.ts";

// ---------------------------------------------------------------------------
// Skill name → slug mapping (extends base with paren-stripped variants)
// ---------------------------------------------------------------------------

const SKILL_MAP: Record<string, string> = { ...BASE_SKILL_MAP };

// "Knowledge (nature)" → "knowledgenature", etc.
// Also index without parens: "knowledge nature" → "knowledgenature"
for (const name of SKILL_NAMES) {
  const noParen = name.replace(/\s*\([^)]*\)\s*/, " ").trim();
  if (noParen !== name) {
    SKILL_MAP[noParen.toLowerCase()] = stripSeparators(name);
  }
}

// ---------------------------------------------------------------------------
// All Knowledge skills for "Add all Knowledge skills" pattern
// ---------------------------------------------------------------------------

const ALL_KNOWLEDGE_SKILLS = SKILL_NAMES.filter((n) => n.startsWith("Knowledge"));

// ---------------------------------------------------------------------------
// Detect domain modifiers from description text
// ---------------------------------------------------------------------------

export function buildDomainDetected(raw: DomainReference["raw"]): DomainReference["detected"] {
  const detected: DomainReference["detected"] = {};

  for (const entry of raw) {
    const { modifiers, errors, unresolvedModifiers } = detectDomainModifiers(entry.description);

    detected[entry.name] = {
      modifiers,
      ...(errors.length > 0 ? { errors } : {}),
      ...(unresolvedModifiers.length > 0 ? { unresolvedModifiers } : {}),
    };
  }

  return detected;
}

export function buildDomainMapping(
  raw: DomainReference["raw"],
  detected: DomainReference["detected"],
  overrides: DomainReference["mapping"]["overrides"],
): DomainReference["mapping"] {
  const mapping = { overrides } as DomainReference["mapping"];
  for (const entry of raw) {
    const det = detected[entry.name];
    const ovr = overrides[entry.name];
    const description = ovr?.description ?? entry.description;
    const modifiers = ovr?.modifiers ?? det?.modifiers ?? [];

    mapping[entry.name] = {
      description,
      ...(modifiers.length > 0 ? { modifiers } : {}),
      ...(ovr?.featPool ? { featPool: ovr.featPool } : {}),
    };
  }
  return mapping;
}

function detectDomainModifiers(description: string): { modifiers: ModifierSeed[]; errors: string[]; unresolvedModifiers: string[] } {
  const modifiers: ModifierSeed[] = [];
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
