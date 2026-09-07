import type { Db } from "@/server/database/index.ts";
import type { SkillsHooks, PropertyRecord } from "@/server/rulesets/hooks/SkillsHooks.ts";
import {
  Aptitudes,
  Feats,
  FeatsAptitudes,
  Modifiers,
  Properties,
  Requirements,
} from "@/server/repositories/index.ts";
import { deleteModifiersWithCascade } from "@/server/services/rulesets/cow.ts";
import { SKILL_IMPACTED_BY_WEIGHT, SKILL_USABLE_WITHOUT_TRAINING } from "@/server/rulesets/dnd3.5/properties/index.ts";
import { stripSeparators } from "@/shared/utils.ts";

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

  async generateSkillFeat(tx: Db, rulesetId: string, sourceChain: string[], skillName: string): Promise<void> {
    let generalAptitude = await Aptitudes.findOne(tx, { name: "General", rulesetId });
    if (!generalAptitude) {
      for (const ancestorId of sourceChain) {
        generalAptitude = await Aptitudes.findOne(tx, { name: "General", rulesetId: ancestorId });
        if (generalAptitude) break;
      }
    }
    if (!generalAptitude) return;

    const rows = await Feats.create(tx, {
      name: `Skill Focus: ${skillName}`,
      description: `You get a +3 bonus on all ${skillName} checks.`,
      rulesetId,
    });
    const feat = rows[0];

    await FeatsAptitudes.create(tx, { featId: feat.id, aptitudeId: generalAptitude.id });

    await Modifiers.createMany(tx, [{
      sourceId: feat.id,
      sourceType: "feats",
      target: `skills.${stripSeparators(skillName)}.misc`,
      operator: "add",
      value: "3",
      valueType: "number",
    }]);
  }

  async deleteSkillFeat(tx: Db, rulesetId: string, sourceChain: string[], skillName: string): Promise<void> {
    let feat = await Feats.findOne(tx, { name: `Skill Focus: ${skillName}`, rulesetId });
    if (!feat) {
      for (const ancestorId of sourceChain) {
        feat = await Feats.findOne(tx, { name: `Skill Focus: ${skillName}`, rulesetId: ancestorId });
        if (feat) break;
      }
    }
    if (!feat) return;

    await deleteModifiersWithCascade(tx, { sourceIds: [feat.id], sourceType: "feats" });
    await Requirements.deleteMany(tx, { entityIds: [feat.id], entityType: "feats" });
    await Properties.deleteMany(tx, { entityIds: [feat.id], entityType: "feats" });
    // Hard-delete: FK CASCADE on feats_aptitudes wipes the aptitude link.
    // Soft-archive would block a future generateSkillFeat with the same name
    // (the unique index on feats doesn't filter deleted_at).
    await Feats.delete(tx, { id: feat.id });
  }
}
