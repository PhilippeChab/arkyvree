import type { CachedRulesetData } from "@/server/cache/rulesetCache/index.ts";
import type { Db } from "@/server/database/index.ts";
import { ConflictError } from "@/server/errors/index.ts";
import { Aptitudes, Feats, FeatsAptitudes, Modifiers, Properties } from "@/server/repositories/index.ts";
import {
  SKILL_CHECK_PENALTY_MULTIPLIER,
  SKILL_IMPACTED_BY_WEIGHT,
  SKILL_USABLE_WITHOUT_TRAINING,
} from "@/server/rulesets/dnd3.5/properties/index.ts";
import { NO_SKILL_FLAGS, readSkillFlags } from "@/server/rulesets/dnd3.5/skillFlags.ts";
import type { PropertyRecord, SkillFlags, SkillsHooks } from "@/server/rulesets/hooks/index.ts";
import { cowEntityForCustomization, hasCharacterPicks } from "@/server/services/rulesets/cow/index.ts";
import { stripSeparators } from "@/shared/text.ts";

export class Dnd35SkillsHooks implements SkillsHooks {
  buildProperties(skillId: string, flags: SkillFlags): PropertyRecord[] {
    const { impactedByWeight, checkPenaltyMultiplier, usableWithoutTraining } = flags;
    const property = (type: string, value: string): PropertyRecord => ({
      entityId: skillId,
      entityType: "skills",
      type,
      value,
    });
    return [
      ...(impactedByWeight ? [property(SKILL_IMPACTED_BY_WEIGHT, "true")] : []),
      // A skill armor weighs on takes the penalty once unless it says otherwise.
      ...(impactedByWeight && checkPenaltyMultiplier !== 1
        ? [property(SKILL_CHECK_PENALTY_MULTIPLIER, String(checkPenaltyMultiplier))]
        : []),
      ...(usableWithoutTraining ? [property(SKILL_USABLE_WITHOUT_TRAINING, "true")] : []),
    ];
  }

  async deleteSkillFeat(tx: Db, rulesetId: string, rulesetData: CachedRulesetData, skillName: string): Promise<void> {
    const feat = rulesetData.feats.find((f) => f.name === `Skill Focus: ${skillName}`);
    if (!feat) return;
    if (await hasCharacterPicks(tx, "feats", feat.id, rulesetId)) {
      throw new ConflictError("Cannot remove a Skill Focus feat in use by a character in this ruleset");
    }

    // Deleting the local COW copy leaves a tombstone snapshot: the obsolete
    // inherited feat disappears from this fork while its ancestor stays intact.
    const targetId = await cowEntityForCustomization(tx, rulesetId, "feats", feat.id);
    // Hard-delete: FK CASCADE on feats_aptitudes wipes the aptitude link, and
    // the database deletes the feat's customizations.
    // Soft-archive would block a future generateSkillFeat with the same name
    // (the unique index on feats doesn't filter deleted_at).
    await Feats.delete(tx, { id: targetId });
  }

  enrichWithProperties<T extends { id: string }>(
    skills: T[],
    properties: { entityId: string; type: string; value: string }[],
  ): (T & SkillFlags)[] {
    const flagsBySkillId = readSkillFlags(properties);
    return skills.map((skill) => ({ ...skill, ...(flagsBySkillId.get(skill.id) ?? NO_SKILL_FLAGS) }));
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
      generated: true,
      rulesetId,
    });
    const feat = rows[0];

    await FeatsAptitudes.create(tx, { featId: feat.id, aptitudeId: generalAptitude.id });

    await Modifiers.createMany(tx, [
      {
        sourceId: feat.id,
        sourceType: "feats",
        target: `skills.${stripSeparators(skillName)}.misc`,
        operator: "add",
        value: "3",
        valueType: "number",
      },
    ]);
  }

  async syncProperties(tx: Db, skillId: string, flags: SkillFlags): Promise<void> {
    await Properties.delete(tx, {
      entityIds: [skillId],
      entityType: "skills",
      types: [SKILL_IMPACTED_BY_WEIGHT, SKILL_CHECK_PENALTY_MULTIPLIER, SKILL_USABLE_WITHOUT_TRAINING],
    });

    const records = this.buildProperties(skillId, flags);
    if (records.length > 0) {
      await Properties.createMany(tx, records);
    }
  }
}
