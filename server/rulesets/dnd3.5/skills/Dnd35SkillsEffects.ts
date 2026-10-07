import type { RulesetScope } from "@/server/cache/rulesetCache/index.ts";
import { hasCharacterPicks, RulesetEdit } from "@/server/cow/index.ts";
import type { Db } from "@/server/database/index.ts";
import { ConflictError } from "@/server/errors/index.ts";
import { Feats, FeatsAptitudes, Modifiers, Properties } from "@/server/repositories/index.ts";
import { Dnd35LevelsRules } from "@/server/rulesets/dnd3.5/levels/Dnd35LevelsRules.ts";
import { normalizeSkillFlags } from "@/server/rulesets/dnd3.5/skills/skillFlags.ts";
import SkillsPaths from "@/server/rulesets/dnd3.5/skills/SkillsPaths.ts";
import type { PropertyRecord } from "@/server/rulesets/dnd3.5/types.ts";
import type { SkillFlags, SkillsEffects } from "@/server/rulesets/engine/module/index.ts";
import {
  SKILL_CHECK_PENALTY_MULTIPLIER,
  SKILL_IMPACTED_BY_WEIGHT,
  SKILL_USABLE_WITHOUT_TRAINING,
} from "@/shared/dnd3.5/properties/index.ts";

export class Dnd35SkillsEffects implements SkillsEffects {
  private buildProperties(skillId: string, flags: SkillFlags): PropertyRecord[] {
    const { impactedByWeight, checkPenaltyMultiplier, usableWithoutTraining } = normalizeSkillFlags(flags);
    const property = (type: string, value: string): PropertyRecord => ({
      entityId: skillId,
      entityType: "skills",
      type,
      value,
    });
    return [
      ...(impactedByWeight ? [property(SKILL_IMPACTED_BY_WEIGHT, "true")] : []),
      // A skill takes the penalty once unless it says otherwise.
      ...(checkPenaltyMultiplier !== 1
        ? [property(SKILL_CHECK_PENALTY_MULTIPLIER, String(checkPenaltyMultiplier))]
        : []),
      ...(usableWithoutTraining ? [property(SKILL_USABLE_WITHOUT_TRAINING, "true")] : []),
    ];
  }

  async deleteSkillFeat(tx: Db, scope: RulesetScope, skillName: string): Promise<void> {
    const { ruleset, rulesetData } = scope;
    const feat = rulesetData.feats.find((f) => f.name === `Skill Focus: ${skillName}`);
    if (!feat) return;
    if (await hasCharacterPicks(tx, "feats", feat.id, ruleset.id)) {
      throw new ConflictError("Cannot remove a Skill Focus feat in use by a character in this ruleset");
    }

    // Deleting the local COW copy leaves a tombstone snapshot: the obsolete
    // inherited feat disappears from this fork while its ancestor stays intact.
    const targetId = await new RulesetEdit(ruleset, rulesetData.cow).cowOwner(tx, "feats", feat.id);
    // Hard-delete: FK CASCADE on feats_aptitudes wipes the aptitude link, and
    // the database deletes the feat's customizations.
    // Soft-archive would block a future generateSkillFeat with the same name
    // (the unique index on feats doesn't filter deleted_at).
    await Feats.delete(tx, { id: targetId });
  }

  async generateSkillFeat(tx: Db, scope: RulesetScope, skillName: string): Promise<void> {
    const rulesetId = scope.ruleset.id;
    const generalAptitudeId = scope.rulesetData.aptitudeIdBySlug.get(Dnd35LevelsRules.GENERAL_FEATS_APTITUDE_SLUG);
    if (!generalAptitudeId) return;

    const rows = await Feats.create(tx, {
      name: `Skill Focus: ${skillName}`,
      description: `You get a +3 bonus on all ${skillName} checks.`,
      generated: true,
      rulesetId,
    });
    const feat = rows[0];

    await FeatsAptitudes.create(tx, { featId: feat.id, aptitudeId: generalAptitudeId });

    await Modifiers.createMany(tx, [
      {
        sourceId: feat.id,
        sourceType: "feats",
        target: SkillsPaths.misc(skillName),
        operator: "add",
        value: "3",
        valueType: "number",
      },
    ]);
  }

  async syncProperties(tx: Db, skillId: string, flags: SkillFlags): Promise<SkillFlags> {
    await Properties.delete(tx, {
      entityIds: [skillId],
      entityType: "skills",
      types: [SKILL_IMPACTED_BY_WEIGHT, SKILL_CHECK_PENALTY_MULTIPLIER, SKILL_USABLE_WITHOUT_TRAINING],
    });

    const records = this.buildProperties(skillId, flags);
    if (records.length > 0) {
      await Properties.createMany(tx, records);
    }
    return normalizeSkillFlags(flags);
  }
}
