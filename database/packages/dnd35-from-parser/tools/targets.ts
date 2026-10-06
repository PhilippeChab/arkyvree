/**
 * What a skill or a save the books name targets: its slug in a target path, or the requirement on any skill of a
 * family.
 */

import { gte, or } from "@/database/packages/dnd35/content/customization/requirements.ts";
import type { RequirementEntry } from "@/database/packages/dnd35/content/customization/types.ts";
import { SKILL_NAMES } from "@/database/packages/dnd35/data/skills.ts";
import { stripSeparators } from "@/shared/text.ts";

const SAVE_NAMES = ["Fortitude", "Reflex", "Will"];

export const SAVE_MAP: Record<string, string> = Object.fromEntries(
  SAVE_NAMES.flatMap((name) => [
    [name.toLowerCase(), stripSeparators(name)],
    [`${name.toLowerCase()} saving`, stripSeparators(name)],
  ]),
);

export const SKILL_MAP: Record<string, string> = Object.fromEntries(
  SKILL_NAMES.map((name) => [name.toLowerCase(), stripSeparators(name)]),
);

/** `ranks` in any skill "X (any)" names ("Knowledge (any)": any Knowledge skill), or none when it names no skill. */
export function anySkillRequirement(name: string, ranks: number): RequirementEntry | undefined {
  if (!/\(any\)/i.test(name)) return undefined;
  const baseName = name
    .replace(/\s*\(any\)/i, "")
    .trim()
    .toLowerCase();
  const checks = SKILL_NAMES.filter((s) => s.toLowerCase().startsWith(baseName)).map((s) =>
    gte(`skills.${stripSeparators(s)}.rank`, ranks),
  );
  if (checks.length <= 1) return checks[0];
  return or(...checks);
}

/**
 * A skill's slug: its own ("Knowledge (arcana)" → "knowledgearcana"), else its base skill's, for a specialization the
 * skill list doesn't name ("Perform (dance)" → "perform").
 */
export function skillSlug(name: string): string {
  const fullKey = name.toLowerCase().trim();
  if (SKILL_MAP[fullKey]) return SKILL_MAP[fullKey];
  const baseName = name
    .replace(/\s*\([^)]*\)\s*$/, "")
    .toLowerCase()
    .trim();
  return SKILL_MAP[baseName] ?? stripSeparators(baseName);
}
