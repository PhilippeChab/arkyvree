import { getTableName } from "drizzle-orm";

import { skillsInRules } from "@/drizzle/schema.ts";
import { describeSkill, describeSkills, planSkillCreate, planSkillDelete, planSkillEdit } from "@/engine/index.ts";
import { RulesetCache, withRulesetScope } from "@/server/cache/rulesetCache/index.ts";
import { hasCharacterPicks, RulesetEdit } from "@/server/cow/index.ts";
import { db, withTransaction } from "@/server/database/index.ts";
import { ConflictError, STALE_ENTITY_MESSAGE } from "@/server/errors/index.ts";
import { Skills } from "@/server/repositories/index.ts";
import { createActivityWithNotifications, getChangedFields } from "@/server/services/activities/index.ts";
import { RulesetsPolicy } from "@/server/services/policies/index.ts";
import { writeEntityWrites } from "@/server/services/rulesets/entityWrites.ts";
import type { Session } from "@/shared/relations.ts";

/** A skill's body: its row's columns, and the fields its ruleset's rules keep (`planSkillCreate`). */
type SkillBody = Parameters<typeof planSkillCreate>[1];

class SkillsService {
  async createSkill(session: Session, rulesetId: string, body: SkillBody) {
    const result = await withTransaction(
      async (tx) =>
        await withRulesetScope(tx, rulesetId, async (scope) => {
          const { ruleset, rulesetData } = scope;
          (await RulesetsPolicy.for(tx, session, ruleset)).canUpdateEntity();

          const plan = planSkillCreate(scope, body);

          const edit = new RulesetEdit(ruleset, rulesetData.cow);
          const { tombstoneAncestorId } = await edit.assertNameAvailable(tx, "skills", body.name);

          const rows = await Skills.create(tx, { ...plan.columns, rulesetId });
          const skill = rows[0];

          if (tombstoneAncestorId) await edit.repointTombstone(tx, "skills", tombstoneAncestorId, skill.id);

          await writeEntityWrites(tx, scope, { entityId: skill.id, entityType: "skills" }, plan.writes);

          await createActivityWithNotifications(tx, {
            userId: session.userId,
            targetId: skill.id,
            targetTable: getTableName(skillsInRules),
            type: "createSkill",
            data: { entityName: skill.name },
          });

          return plan.describe(skill);
        }),
    );
    RulesetCache.invalidate(rulesetId);
    return result;
  }

  async deleteSkill(session: Session, rulesetId: string, skillId: string) {
    const result = await withTransaction(
      async (tx) =>
        await withRulesetScope(tx, rulesetId, async (scope) => {
          const { ruleset, rulesetData } = scope;

          const inUse = await hasCharacterPicks(tx, "skills", skillId, rulesetId);
          (await RulesetsPolicy.for(tx, session, ruleset)).canDeleteEntity({ inUse });

          const { skill, writes } = planSkillDelete(scope, skillId);

          const edit = new RulesetEdit(ruleset, rulesetData.cow);
          const targetId = await edit.cowToDelete(tx, "skills", skill);

          await writeEntityWrites(tx, scope, { entityId: targetId, entityType: "skills" }, writes);

          // FK CASCADE on klass_skills.skill_id wipes those join rows.
          // The database deletes its customizations with it.
          const rows = await Skills.delete(tx, { id: targetId });
          const deletedSkill = rows[0];

          await createActivityWithNotifications(tx, {
            userId: session.userId,
            targetId,
            targetTable: getTableName(skillsInRules),
            type: "deleteSkill",
            data: { rulesetId, entityName: skill.name },
          });

          return deletedSkill;
        }),
    );
    RulesetCache.invalidate(rulesetId);
    return result;
  }

  async getSkill(rulesetId: string, skillId: string) {
    return await withRulesetScope(db, rulesetId, async (scope) => describeSkill(scope, skillId));
  }

  async getSkills(
    rulesetId: string,
    where: {
      childOnly?: boolean;
      orderBy?: "name" | "createdAt" | "updatedAt";
      orderDir?: "asc" | "desc";
      search?: string;
    },
    pagination: { limit: number; page: number },
  ) {
    return await withRulesetScope(db, rulesetId, async (scope) => {
      const { sourceChain } = scope.rulesetData.cow;
      const result = await Skills.findPage(db, { rulesetId, ancestorRulesetIds: sourceChain, ...where }, pagination);
      return { ...result, items: describeSkills(scope, result.items) };
    });
  }

  async updateSkill(session: Session, rulesetId: string, skillId: string, body: SkillBody & { updatedAt?: string }) {
    const result = await withTransaction(
      async (tx) =>
        await withRulesetScope(tx, rulesetId, async (scope) => {
          const { ruleset, rulesetData } = scope;

          (await RulesetsPolicy.for(tx, session, ruleset)).canUpdateEntity();

          const { columns, describe, skill, writes } = planSkillEdit(scope, skillId, body);

          const edit = new RulesetEdit(ruleset, rulesetData.cow);
          const { id: targetId, copied } = await edit.cowToEdit(tx, "skills", skill);
          const expectedUpdatedAt = copied ? undefined : body.updatedAt;

          const rows = await Skills.update(tx, columns, { id: targetId, expectedUpdatedAt });
          if (expectedUpdatedAt && rows.length === 0) throw new ConflictError(STALE_ENTITY_MESSAGE);

          const updatedSkill = rows[0];

          await writeEntityWrites(tx, scope, { entityId: targetId, entityType: "skills" }, writes);

          await createActivityWithNotifications(tx, {
            userId: session.userId,
            targetId,
            targetTable: getTableName(skillsInRules),
            type: "updateSkill",
            data: {
              entityName: body.name,
              changedFields: getChangedFields(skill, body),
            },
          });

          return describe(updatedSkill);
        }),
    );
    RulesetCache.invalidate(rulesetId);
    return result;
  }
}

export default new SkillsService();
