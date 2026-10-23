import { Engine, type KlassSkill } from "@/engine/index.ts";
import { EntityEdit, RulesetViews, withRulesetScope } from "@/server/cow/index.ts";
import { db, withTransaction } from "@/server/database/index.ts";
import { Joins } from "@/server/repositories/index.ts";
import { createActivityWithNotifications } from "@/server/services/activities/index.ts";
import { RulesetsPolicy } from "@/server/services/policies/index.ts";
import { hasCharacterPicks } from "@/server/services/rulesets/characterPicks.ts";
import type { Session } from "@/shared/relations.ts";

class ClassSkillsService {
  async addClassSkill(session: Session, rulesetId: string, classId: string, skillId: string) {
    const result = await withTransaction(
      async (tx) =>
        await withRulesetScope(tx, rulesetId, async (scope) => {
          const { ruleset } = scope;

          (await RulesetsPolicy.for(tx, session, ruleset)).canUpdateEntity();

          const { klass, skill } = Engine.for(scope).class(classId).planSkillAdd(skillId);

          // Copy an inherited class: the new klass_skills row would otherwise point at the parent ruleset's class.
          const edit = new EntityEdit(ruleset);
          const { id: targetKlassId } = await edit.cowToEdit(tx, "klasses", klass);

          const rows = await Joins.create<KlassSkill>(tx, "klass_skills", {
            klassId: targetKlassId,
            skillId: skill.id,
          });
          const klassSkill = rows[0];

          await createActivityWithNotifications(tx, {
            userId: session.userId,
            targetId: klassSkill.klassId,
            targetTable: "klass_skills",
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
          const { ruleset } = scope;

          const inUse = await hasCharacterPicks(
            tx,
            "klasses",
            scope.rulesetData.cow.getEquivalentIds(classId),
            rulesetId,
          );
          (await RulesetsPolicy.for(tx, session, ruleset)).canDeleteEntity({ inUse });

          const { klass, klassSkill, skill } = Engine.for(scope).class(classId).planSkillRemove(skillId);

          // Copy an inherited class: the delete would otherwise remove the parent ruleset's klass_skills row.
          const edit = new EntityEdit(ruleset);
          const { id: targetKlassId } = await edit.cowToEdit(tx, "klasses", klass);

          const rows = await Joins.delete<KlassSkill>(tx, {
            join: "klass_skills",
            fromId: targetKlassId,
            toId: klassSkill.skillId,
          });
          const removedKlassSkill = rows[0];

          await createActivityWithNotifications(tx, {
            userId: session.userId,
            targetId: removedKlassSkill.klassId,
            targetTable: "klass_skills",
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
