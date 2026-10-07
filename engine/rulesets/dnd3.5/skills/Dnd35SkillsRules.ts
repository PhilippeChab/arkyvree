import type { SkillFields, SkillsRules } from "@/engine/rulesets/dnd3.5/module/index.ts";

import { normalizeSkillFields, readSkillFields } from "./skillFields.ts";

export class Dnd35SkillsRules implements SkillsRules {
  enrichWithProperties<T extends { id: string }>(
    skills: T[],
    properties: { entityId: string; type: string; value: string }[],
  ): (T & SkillFields)[] {
    const propertiesBySkillId = Map.groupBy(properties, (property) => property.entityId);
    return skills.map((skill) => ({ ...skill, ...readSkillFields(propertiesBySkillId.get(skill.id) ?? []) }));
  }

  normalizeFields(fields: SkillFields): SkillFields {
    return normalizeSkillFields(fields);
  }

  readProperties(properties: { type: string; value: string }[]): SkillFields {
    return readSkillFields(properties);
  }
}
