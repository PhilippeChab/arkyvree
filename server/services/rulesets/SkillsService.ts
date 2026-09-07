import { skillsInRules } from "@/drizzle/schema.ts";
import { stripSeparators } from "@/shared/utils.ts";
import { db, withTransaction } from "@/server/database/index.ts";
import { BadRequestError, ConflictError, NotFoundError, STALE_ENTITY_MESSAGE } from "@/server/errors/index.ts";
import { Skills } from "@/server/repositories/index.ts";
import { RulesetFactory } from "@/server/rulesets/RulesetFactory.ts";
import { invalidateRuleset } from "@/server/cache/rulesetCache.ts";
import BaseService from "@/server/services/BaseService.ts";
import { createActivityWithNotifications, getChangedFields } from "@/server/services/activityNotifications.ts";
import {
  assertEntityNameAvailable,
  cowEntity,
  deleteModifiersWithCascade,
  deletePropertiesWithCascade,
  deleteRequirementsWithCascade,
  entityHasCharacterPicks,
  repointTombstoneSnapshot,
  withRulesetScope,
} from "@/server/services/rulesets/cow.ts";
import { getRulesetPolicy } from "@/server/services/rulesets/helpers.ts";
import type { Property, Session } from "@/shared/relations.ts";
import { getTableName } from "drizzle-orm";

export const SkillsMethods = {
  async getRulesetSkills(
    rulesetId: string,
    where: { childOnly?: boolean; search?: string; orderBy?: "name" | "createdAt" | "updatedAt"; orderDir?: "asc" | "desc" },
    pagination: { limit: number; page: number },
  ) {
    return await withRulesetScope(db, rulesetId, async ({ ruleset, rulesetData }) => {
      const { sourceChain } = rulesetData.cow;
      const hooks = RulesetFactory.fromBaseRules(ruleset.baseRules).hooks;
      const result = await Skills.findManyByRulesetId(db, { rulesetId, ancestorRulesetIds: sourceChain, ...where }, pagination);

      // Flatten per-skill properties from the cache into a single array for
      // enrichWithProperties (which does the entity-type filtering internally).
      const properties: Property[] = [];
      for (const s of result.items) {
        const ps = rulesetData.propertiesByEntity.get(s.id);
        if (ps) properties.push(...ps);
      }

      return {
        ...result,
        items: hooks.skills.enrichWithProperties(result.items, properties),
      };
    });
  },

  async getRulesetSkill(rulesetId: string, skillId: string) {
    return await withRulesetScope(db, rulesetId, async ({ ruleset, rulesetData }) => {
      const { sourceChain } = rulesetData.cow;
      const skill = rulesetData.skillsById.get(skillId);
      if (!skill || (skill.rulesetId !== rulesetId && !sourceChain.includes(skill.rulesetId))) {
        throw new NotFoundError("Skill not found in this ruleset");
      }

      const hooks = RulesetFactory.fromBaseRules(ruleset.baseRules).hooks;
      const properties = rulesetData.propertiesByEntity.get(skill.id) ?? [];
      const [enriched] = hooks.skills.enrichWithProperties([skill], properties);
      return enriched;
    });
  },

  async createRulesetSkill(session: Session, rulesetId: string, body: {
    name: string;
    description?: string | null;
    primaryAbilityId: string;
    impactedByWeight: boolean;
    usableWithoutTraining: boolean;
  }) {
    const result = await withTransaction(async (tx) => {
      return await withRulesetScope(tx, rulesetId, async ({ ruleset, rulesetData }) => {
        const { sourceChain } = rulesetData.cow;

        (await getRulesetPolicy(tx, session, ruleset)).canUpdateEntity();

        if (stripSeparators(body.name) === "budget") {
          throw new BadRequestError("\"Budget\" is a reserved skill name");
        }

        const { tombstoneAncestorId } = await assertEntityNameAvailable(tx, rulesetId, sourceChain, "skills", body.name);

        const hooks = RulesetFactory.fromBaseRules(ruleset.baseRules).hooks;

        const { impactedByWeight, usableWithoutTraining, ...skillData } = body;
        const rows = await Skills.create(tx, { ...skillData, rulesetId });
        const skill = rows[0];

        if (tombstoneAncestorId) {
          await repointTombstoneSnapshot(tx, rulesetId, "skills", tombstoneAncestorId, skill.id);
        }

        await hooks.skills.syncProperties(tx, skill.id, { impactedByWeight, usableWithoutTraining });
        await hooks.skills.generateSkillFeat(tx, rulesetId, sourceChain, body.name);

        await createActivityWithNotifications(tx, {
          userId: session.userId,
          targetId: skill.id,
          targetTable: getTableName(skillsInRules),
          type: "createSkill",
          data: { entityName: skill.name },
        });

        return { ...skill, impactedByWeight, usableWithoutTraining };
      });
    });
    invalidateRuleset(rulesetId);
    return result;
  },

  async updateRulesetSkill(session: Session, rulesetId: string, skillId: string, body: {
    name: string;
    description?: string | null;
    primaryAbilityId: string;
    impactedByWeight: boolean;
    usableWithoutTraining: boolean;
    updatedAt?: string;
  }) {
    const result = await withTransaction(async (tx) => {
      return await withRulesetScope(tx, rulesetId, async ({ ruleset, rulesetData }) => {
        const { sourceChain } = rulesetData.cow;

        (await getRulesetPolicy(tx, session, ruleset)).canUpdateEntity();

        const skill = rulesetData.skillsById.get(skillId);
        const isOwned = skill && skill.rulesetId === rulesetId;
        const isInherited = skill && sourceChain.includes(skill.rulesetId);
        if (!skill || (!isOwned && !isInherited)) {
          throw new NotFoundError("Skill not found in this ruleset");
        }

        if (stripSeparators(body.name) === "budget") {
          throw new BadRequestError("\"Budget\" is a reserved skill name");
        }

        let targetId = skill.id;
        const expectedUpdatedAt = isOwned ? body.updatedAt : undefined;
        if (isInherited) {
          const cowResult = await cowEntity(tx, "skills", skill.id, rulesetId, sourceChain);
          targetId = cowResult.id as string;
        }

        const hooks = RulesetFactory.fromBaseRules(ruleset.baseRules).hooks;
        const { impactedByWeight, usableWithoutTraining, updatedAt: _u, ...skillData } = body;
        const rows = await Skills.update(tx, skillData, { id: targetId, expectedUpdatedAt });
        if (expectedUpdatedAt && rows.length === 0) {
          throw new ConflictError(STALE_ENTITY_MESSAGE);
        }
        const updatedSkill = rows[0];

        await hooks.skills.syncProperties(tx, targetId, { impactedByWeight, usableWithoutTraining });

        if (skill.name !== body.name) {
          await hooks.skills.deleteSkillFeat(tx, rulesetId, sourceChain, skill.name);
          await hooks.skills.generateSkillFeat(tx, rulesetId, sourceChain, body.name);
        }

        await createActivityWithNotifications(tx, {
          userId: session.userId,
          targetId,
          targetTable: getTableName(skillsInRules),
          type: "updateSkill",
          data: { entityName: body.name, changedFields: getChangedFields(skill as Record<string, unknown>, body as Record<string, unknown>) },
        });

        return { ...updatedSkill, impactedByWeight, usableWithoutTraining };
      });
    });
    invalidateRuleset(rulesetId);
    return result;
  },

  async deleteRulesetSkill(session: Session, rulesetId: string, skillId: string) {
    const result = await withTransaction(async (tx) => {
      return await withRulesetScope(tx, rulesetId, async ({ ruleset, rulesetData }) => {
        const { sourceChain } = rulesetData.cow;

        const inUse = await entityHasCharacterPicks(tx, "skills", skillId, rulesetId);
        (await getRulesetPolicy(tx, session, ruleset)).canDeleteEntity({ inUse });

        const skill = rulesetData.skillsById.get(skillId);
        const isOwned = skill && skill.rulesetId === rulesetId;
        const isInherited = skill && sourceChain.includes(skill.rulesetId);
        if (!skill || (!isOwned && !isInherited)) {
          throw new NotFoundError("Skill not found in this ruleset");
        }

        let targetId = skill.id;
        if (isInherited) {
          const cowResult = await cowEntity(tx, "skills", skill.id, rulesetId, sourceChain);
          targetId = cowResult.id as string;
        }

        const hooks = RulesetFactory.fromBaseRules(ruleset.baseRules).hooks;
        await hooks.skills.deleteSkillFeat(tx, rulesetId, sourceChain, skill.name);

        // Customizations are polymorphic FKs — Postgres can't cascade these.
        await deleteModifiersWithCascade(tx, { sourceIds: [targetId], sourceType: "skills" });
        await deletePropertiesWithCascade(tx, { entityIds: [targetId], entityType: "skills" });
        await deleteRequirementsWithCascade(tx, { entityIds: [targetId], entityType: "skills" });

        // FK CASCADE on klass_skills.skill_id wipes those join rows.
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
      });
    });
    invalidateRuleset(rulesetId);
    return result;
  },
} as const;

class SkillsService extends BaseService<typeof SkillsMethods> {
  static initialize() {
    return new SkillsService(SkillsMethods);
  }
}

export default SkillsService;
