/** What a prerequisite asks of a skill a family of skills names: ranks in any of them. */

import { gte, or } from "@/database/packages/dnd35/content/customization/requirements.ts";
import type { RequirementEntry } from "@/database/packages/dnd35/content/customization/types.ts";
import { SKILL_NAMES } from "@/database/packages/dnd35/data/skills.ts";
import { stripSeparators } from "@/shared/text.ts";

/** `ranks` in any skill "X (any)" names ("Knowledge (any)": any Knowledge skill), or none when it names no skill. */
export function readAnySkillRequirement(name: string, ranks: number): RequirementEntry | undefined {
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
