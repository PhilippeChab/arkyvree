import { getTableName } from "drizzle-orm";

import { skillsInRules } from "@/drizzle/schema.ts";
import { describeSkills, planSkillDelete, planSkillSave } from "@/engine/index.ts";
import { findScopedEntity, RulesetCache, withRulesetScope } from "@/server/cache/rulesetCache/index.ts";
import { hasCharacterPicks, RulesetEdit } from "@/server/cow/index.ts";
import { db, withTransaction } from "@/server/database/index.ts";
import { ConflictError, STALE_ENTITY_MESSAGE } from "@/server/errors/index.ts";
import { Skills } from "@/server/repositories/index.ts";
import { createActivityWithNotifications, getChangedFields } from "@/server/services/activities/index.ts";
import { RulesetsPolicy } from "@/server/services/policies/index.ts";
import { writeEntityWrites } from "@/server/services/rulesets/entityWrites.ts";
import type { Session } from "@/shared/relations.ts";

/** A skill's body: its row's columns, and the fields its ruleset's rules keep (`planSkillSave`). */
type SkillBody = Parameters<typeof planSkillSave>[1] & {
  description?: string | null;
  name: string;
  primaryAbilityId: string;
};

class SkillsService {
  async createSkill(session: Session, rulesetId: string, body: SkillBody) {
    const result = await withTransaction(
      async (tx) =>
        await withRulesetScope(tx, rulesetId, async (scope) => {
          const { ruleset, rulesetData } = scope;
          (await RulesetsPolicy.for(tx, session, ruleset)).canUpdateEntity();

          const writes = planSkillSave(scope, body);

          const edit = new RulesetEdit(ruleset, rulesetData.cow);
          const { tombstoneAncestorId } = await edit.assertNameAvailable(tx, "skills", body.name);

          const { name, description, primaryAbilityId } = body;
          const rows = await Skills.create(tx, { name, description, primaryAbilityId, rulesetId });
          const skill = rows[0];

          if (tombstoneAncestorId) await edit.repointTombstone(tx, "skills", tombstoneAncestorId, skill.id);

          const properties = await writeEntityWrites(tx, scope, { entityId: skill.id, entityType: "skills" }, writes);

          await createActivityWithNotifications(tx, {
            userId: session.userId,
            targetId: skill.id,
            targetTable: getTableName(skillsInRules),
            type: "createSkill",
            data: { entityName: skill.name },
          });

          return describeSkills(scope, [skill], properties)[0];
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
          const { sourceChain } = rulesetData.cow;

          const inUse = await hasCharacterPicks(tx, "skills", skillId, rulesetId);
          (await RulesetsPolicy.for(tx, session, ruleset)).canDeleteEntity({ inUse });

          const skill = findScopedEntity(rulesetData.skillsById, skillId, rulesetId, sourceChain, "Skill");

          const edit = new RulesetEdit(ruleset, rulesetData.cow);
          const targetId = await edit.cowToDelete(tx, "skills", skill);

          await writeEntityWrites(
            tx,
            scope,
            { entityId: targetId, entityType: "skills" },
            planSkillDelete(scope, skill),
          );

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
    return await withRulesetScope(db, rulesetId, async (scope) => {
      const { sourceChain } = scope.rulesetData.cow;
      const skill = findScopedEntity(scope.rulesetData.skillsById, skillId, rulesetId, sourceChain, "Skill");
      return describeSkills(scope, [skill])[0];
    });
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
          const { sourceChain } = rulesetData.cow;

          (await RulesetsPolicy.for(tx, session, ruleset)).canUpdateEntity();

          const skill = findScopedEntity(rulesetData.skillsById, skillId, rulesetId, sourceChain, "Skill");
          const writes = planSkillSave(scope, body, skill);

          const edit = new RulesetEdit(ruleset, rulesetData.cow);
          const { id: targetId, copied } = await edit.cowToEdit(tx, "skills", skill);
          const expectedUpdatedAt = copied ? undefined : body.updatedAt;

          const { name, description, primaryAbilityId } = body;
          const rows = await Skills.update(
            tx,
            { name, description, primaryAbilityId },
            { id: targetId, expectedUpdatedAt },
          );
          if (expectedUpdatedAt && rows.length === 0) throw new ConflictError(STALE_ENTITY_MESSAGE);

          const updatedSkill = rows[0];

          const properties = await writeEntityWrites(tx, scope, { entityId: targetId, entityType: "skills" }, writes);

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

          return describeSkills(scope, [updatedSkill], properties)[0];
        }),
    );
    RulesetCache.invalidate(rulesetId);
    return result;
  }
}

export default new SkillsService();
