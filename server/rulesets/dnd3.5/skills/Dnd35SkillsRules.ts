import type { SkillFlags, SkillsRules } from "@/server/rulesets/engine/module/index.ts";

import { NO_SKILL_FLAGS, readSkillFlags } from "./skillFlags.ts";

export class Dnd35SkillsRules implements SkillsRules {
  enrichWithProperties<T extends { id: string }>(
    skills: T[],
    properties: { entityId: string; type: string; value: string }[],
  ): (T & SkillFlags)[] {
    const flagsBySkillId = readSkillFlags(properties);
    return skills.map((skill) => ({ ...skill, ...(flagsBySkillId.get(skill.id) ?? NO_SKILL_FLAGS) }));
  }
}
