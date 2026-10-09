import { getTableName } from "drizzle-orm";

import { klassSkillsInRules } from "@/drizzle/schema.ts";
import { Engine } from "@/engine/index.ts";
import { hasCharacterPicks, RulesetEdit, RulesetViews, withRulesetScope } from "@/server/cow/index.ts";
import { db, withTransaction } from "@/server/database/index.ts";
import { KlassSkills } from "@/server/repositories/index.ts";
import { createActivityWithNotifications } from "@/server/services/activities/index.ts";
import { RulesetsPolicy } from "@/server/services/policies/index.ts";
import type { Session } from "@/shared/relations.ts";

class ClassSkillsService {
  async addClassSkill(session: Session, rulesetId: string, classId: string, skillId: string) {
    const result = await withTransaction(
      async (tx) =>
        await withRulesetScope(tx, rulesetId, async (scope) => {
          const { ruleset, rulesetData } = scope;

          (await RulesetsPolicy.for(tx, session, ruleset)).canUpdateEntity();

          const { klass, skill } = Engine.for(scope).class(classId).planSkillAdd(skillId);

          // Copy an inherited class: the new klass_skills row would otherwise point at the parent ruleset's class.
          const edit = new RulesetEdit(ruleset, rulesetData.cow);
          const { id: targetKlassId } = await edit.cowToEdit(tx, "klasses", klass);

          const rows = await KlassSkills.create(tx, {
            klassId: targetKlassId,
            skillId: skill.id,
          });
          const klassSkill = rows[0];

          await createActivityWithNotifications(tx, {
            userId: session.userId,
            targetId: klassSkill.klassId,
            targetTable: getTableName(klassSkillsInRules),
            type: "addKlassSkill",
            data: { skillId: klassSkill.skillId, entityName: klass.name, skillName: skill.name },
          });

          return klassSkill;
        }),
    );
    RulesetViews.invalidate(rulesetId);
    return result;
  }

  async getClassSkills(rulesetId: string, classId: string) {
    return await withRulesetScope(db, rulesetId, async (scope) => Engine.for(scope).class(classId).describeSkills());
  }

  async removeClassSkill(session: Session, rulesetId: string, classId: string, skillId: string) {
    const result = await withTransaction(
      async (tx) =>
        await withRulesetScope(tx, rulesetId, async (scope) => {
          const { ruleset, rulesetData } = scope;

          const inUse = await hasCharacterPicks(tx, "klasses", classId, rulesetId);
          (await RulesetsPolicy.for(tx, session, ruleset)).canDeleteEntity({ inUse });

          const { klass, klassSkill, skill } = Engine.for(scope).class(classId).planSkillRemove(skillId);

          // Copy an inherited class: the delete would otherwise remove the parent ruleset's klass_skills row.
          const edit = new RulesetEdit(ruleset, rulesetData.cow);
          const { id: targetKlassId } = await edit.cowToEdit(tx, "klasses", klass);

          const rows = await KlassSkills.delete(tx, { klassId: targetKlassId, skillId: klassSkill.skillId });
          const removedKlassSkill = rows[0];

          await createActivityWithNotifications(tx, {
            userId: session.userId,
            targetId: removedKlassSkill.klassId,
            targetTable: getTableName(klassSkillsInRules),
            type: "removeKlassSkill",
            data: { skillId: removedKlassSkill.skillId, rulesetId, entityName: klass.name, skillName: skill?.name },
          });

          return removedKlassSkill;
        }),
    );
    RulesetViews.invalidate(rulesetId);
    return result;
  }
}

export default new ClassSkillsService();
