import type { Db } from "@/server/database/index.ts";
import type { SkillsHooks, PropertyRecord } from "@/server/rulesets/hooks/SkillsHooks.ts";
import { Properties } from "@/server/repositories/index.ts";
import { SKILL_IMPACTED_BY_WEIGHT, SKILL_USABLE_WITHOUT_TRAINING } from "@/server/rulesets/dnd3.5/properties/index.ts";

export class Dnd35SkillsHooks implements SkillsHooks {
  buildProperties(
    skillId: string,
    body: { impactedByWeight: boolean; usableWithoutTraining: boolean },
  ): PropertyRecord[] {
    const { impactedByWeight, usableWithoutTraining } = body;
    const records: PropertyRecord[] = [];

    if (impactedByWeight) {
      records.push({
        entityId: skillId,
        entityType: "skills",
        type: SKILL_IMPACTED_BY_WEIGHT,
        value: "true",
      });
    }

    if (usableWithoutTraining) {
      records.push({
        entityId: skillId,
        entityType: "skills",
        type: SKILL_USABLE_WITHOUT_TRAINING,
        value: "true",
      });
    }

    return records;
  }

  enrichWithProperties<T extends { id: string }>(
    skills: T[],
    properties: { entityId: string; type: string; value: string }[],
  ): (T & { impactedByWeight: boolean; usableWithoutTraining: boolean })[] {
    const propsBySkillId = new Map<string, { impactedByWeight: boolean; usableWithoutTraining: boolean }>();

    for (const prop of properties) {
      let entry = propsBySkillId.get(prop.entityId);
      if (!entry) {
        entry = { impactedByWeight: false, usableWithoutTraining: false };
        propsBySkillId.set(prop.entityId, entry);
      }
      if (prop.type === SKILL_IMPACTED_BY_WEIGHT && prop.value === "true") {
        entry.impactedByWeight = true;
      }
      if (prop.type === SKILL_USABLE_WITHOUT_TRAINING && prop.value === "true") {
        entry.usableWithoutTraining = true;
      }
    }

    return skills.map((skill) => {
      const props = propsBySkillId.get(skill.id);
      return {
        ...skill,
        impactedByWeight: props?.impactedByWeight ?? false,
        usableWithoutTraining: props?.usableWithoutTraining ?? false,
      };
    });
  }

  async syncProperties(
    tx: Db,
    skillId: string,
    body: { impactedByWeight: boolean; usableWithoutTraining: boolean },
  ): Promise<void> {
    await Properties.deleteMany(tx, { entityIds: [skillId], entityType: "skills" });

    const records = this.buildProperties(skillId, body);
    if (records.length > 0) {
      await Properties.createMany(tx, records);
    }
  }

}
