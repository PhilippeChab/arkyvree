import type { RequirementEntry } from "@/database/packages/dnd35/v1/feats/types.ts";
import { SKILL_NAMES } from "@/database/packages/dnd35/v1/feats/skills.ts";
import { stripSeparators } from "@/shared/utils.ts";
import DetailedCharacterAbilities from "@/server/rulesets/universal/DetailedCharacterAbilities.ts";
import DetailedCharacterCombat from "@/server/rulesets/dnd3.5/DetailedCharacterCombat.ts";
import DetailedCharacterSavingThrows from "@/server/rulesets/universal/DetailedCharacterSavingThrows.ts";
import DetailedCharacterSkills from "@/server/rulesets/dnd3.5/DetailedCharacterSkills.ts";
import DetailedCharacterIdentity from "@/server/rulesets/universal/DetailedCharacterIdentity.ts";

// ---------------------------------------------------------------------------
// Path validation — reuses actual server components to stay in sync
// ---------------------------------------------------------------------------

const ABILITY_NAMES = ["Strength", "Dexterity", "Constitution", "Intelligence", "Wisdom", "Charisma"];
const SAVE_NAMES = ["Fortitude", "Reflex", "Will"];
const stubAbilities = ABILITY_NAMES.map((name) => ({ name })) as Parameters<typeof DetailedCharacterAbilities.generateTargetPaths>[0];
const stubSaves = SAVE_NAMES.map((name) => ({ name })) as Parameters<typeof DetailedCharacterSavingThrows.generateTargetPaths>[0];
const stubSkills = SKILL_NAMES.map((name) => ({ name })) as Parameters<typeof DetailedCharacterSkills.generateTargetPaths>[0];

function buildValidPaths(kind: "modifier" | "requirement"): Set<string> {
  return new Set(
    [
      ...DetailedCharacterAbilities.generateTargetPaths(stubAbilities, kind),
      ...DetailedCharacterCombat.generateTargetPaths(kind),
      ...DetailedCharacterSavingThrows.generateTargetPaths(stubSaves, kind),
      ...DetailedCharacterSkills.generateTargetPaths(stubSkills, kind),
      ...DetailedCharacterIdentity.generateTargetPaths(kind),
    ].map((tp) => tp.path),
  );
}

const VALID_MODIFIER_PATHS = buildValidPaths("modifier");
const VALID_REQUIREMENT_PATHS = buildValidPaths("requirement");

// Base slugs for skill groups with subtypes (e.g. "knowledge", "craft", "perform", "profession").
// Paths like "skills.knowledge.rank" are valid — the runtime resolves them as an OR across all subtypes.
const SKILL_GROUP_SLUGS = new Set([
  ...SKILL_NAMES
    .filter((n) => /\(/.test(n))
    .map((n) => stripSeparators(n.replace(/\s*\([^)]*\)/, ""))),
  "craft", "perform", "profession",
]);

export function isValidModifierPath(path: string): boolean {
  return VALID_MODIFIER_PATHS.has(path);
}

/** Validate requirement path. Dynamic patterns (feats, classes, spellcasting) are always structurally valid. */
export function isValidRequirementPath(path: string): boolean {
  if (VALID_REQUIREMENT_PATHS.has(path)) return true;
  if (/^feats\.[a-z]+(?:\.\*)?\.(?:possessed|count)$/.test(path)) return true;
  if (/^classes\.[a-z]+\.level$/.test(path)) return true;
  if (/^spellcasting\.(arcane|divine)$/.test(path)) return true;
  // skills.<groupSlug>.rank — base skill group path (e.g. "skills.knowledge.rank")
  // Also accepts subtypes like "skills.craftleatherworking.rank" via prefix match
  const skillMatch = path.match(/^skills\.([a-z]+)\.rank$/);
  if (skillMatch) {
    const slug = skillMatch[1];
    if (SKILL_GROUP_SLUGS.has(slug)) return true;
    // Check if slug starts with a known group prefix (e.g. "craftleatherworking" starts with "craft")
    for (const group of SKILL_GROUP_SLUGS) {
      if (slug.startsWith(group) && slug.length > group.length) return true;
    }
  }
  return false;
}

/** Recursively find invalid paths in a requirement tree */
export function findInvalidRequirementPaths(req: RequirementEntry): string[] {
  if ("chainingOperator" in req) {
    return req.children.flatMap(findInvalidRequirementPaths);
  }
  return isValidRequirementPath(req.target) ? [] : [req.target];
}
