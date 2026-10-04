import { getTableName } from "drizzle-orm";

import { skillsInRules } from "@/drizzle/schema.ts";
import { invalidateRuleset } from "@/server/cache/rulesetCache/index.ts";
import { db, withTransaction } from "@/server/database/index.ts";
import { BadRequestError, ConflictError, STALE_ENTITY_MESSAGE } from "@/server/errors/index.ts";
import { Skills } from "@/server/repositories/index.ts";
import { RulesetFactory } from "@/server/rulesets/RulesetFactory.ts";
import { createActivityWithNotifications, getChangedFields } from "@/server/services/activities/index.ts";
import { RulesetsPolicy } from "@/server/services/policies/index.ts";
import {
  assertEntityNameAvailable,
  cowEntityToDelete,
  cowEntityToEdit,
  findScopedEntity,
  hasCharacterPicks,
  repointTombstoneSnapshot,
  withRulesetScope,
} from "@/server/services/rulesets/cow/index.ts";
import type { Property, Session } from "@/shared/relations.ts";
import { stripSeparators } from "@/shared/text.ts";

class SkillsService {
  async getSkill(rulesetId: string, skillId: string) {
    return await withRulesetScope(db, rulesetId, async ({ ruleset, rulesetData }) => {
      const { sourceChain } = rulesetData.cow;
      const skill = findScopedEntity(rulesetData.skillsById, skillId, rulesetId, sourceChain, "Skill");

      const hooks = RulesetFactory.fromBaseRules(ruleset.baseRules).hooks;
      const properties = rulesetData.propertiesByEntity.get(skill.id) ?? [];
      const [enriched] = hooks.skills.enrichWithProperties([skill], properties);
      return enriched;
    });
  }

  async getSkills(
    rulesetId: string,
    where: {
      childOnly?: boolean;
      search?: string;
      orderBy?: "name" | "createdAt" | "updatedAt";
      orderDir?: "asc" | "desc";
    },
    pagination: { limit: number; page: number },
  ) {
    return await withRulesetScope(db, rulesetId, async ({ ruleset, rulesetData }) => {
      const { sourceChain } = rulesetData.cow;
      const hooks = RulesetFactory.fromBaseRules(ruleset.baseRules).hooks;
      const result = await Skills.findPage(db, { rulesetId, ancestorRulesetIds: sourceChain, ...where }, pagination);

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
  }

  async createSkill(
    session: Session,
    rulesetId: string,
    body: {
      name: string;
      description?: string | null;
      primaryAbilityId: string;
      impactedByWeight: boolean;
      usableWithoutTraining: boolean;
    },
  ) {
    const result = await withTransaction(async (tx) => {
      return await withRulesetScope(tx, rulesetId, async ({ ruleset, rulesetData }) => {
        const { sourceChain } = rulesetData.cow;

        (await RulesetsPolicy.for(tx, session, ruleset)).canUpdateEntity();

        if (stripSeparators(body.name) === "budget") {
          throw new BadRequestError('"Budget" is a reserved skill name');
        }

        const { tombstoneAncestorId } = await assertEntityNameAvailable(
          tx,
          rulesetId,
          rulesetData.cow,
          "skills",
          body.name,
        );

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
  }

  async updateSkill(
    session: Session,
    rulesetId: string,
    skillId: string,
    body: {
      name: string;
      description?: string | null;
      primaryAbilityId: string;
      impactedByWeight: boolean;
      usableWithoutTraining: boolean;
      updatedAt?: string;
    },
  ) {
    const result = await withTransaction(async (tx) => {
      return await withRulesetScope(tx, rulesetId, async ({ ruleset, rulesetData }) => {
        const { sourceChain } = rulesetData.cow;

        (await RulesetsPolicy.for(tx, session, ruleset)).canUpdateEntity();

        const skill = findScopedEntity(rulesetData.skillsById, skillId, rulesetId, sourceChain, "Skill");

        if (stripSeparators(body.name) === "budget") {
          throw new BadRequestError('"Budget" is a reserved skill name');
        }

        const { id: targetId, copied } = await cowEntityToEdit(tx, ruleset, sourceChain, "skills", skill);
        const expectedUpdatedAt = copied ? undefined : body.updatedAt;

        const hooks = RulesetFactory.fromBaseRules(ruleset.baseRules).hooks;
        const { impactedByWeight, usableWithoutTraining, updatedAt: _u, ...skillData } = body;
        const rows = await Skills.update(tx, skillData, { id: targetId, expectedUpdatedAt });
        if (expectedUpdatedAt && rows.length === 0) {
          throw new ConflictError(STALE_ENTITY_MESSAGE);
        }
        const updatedSkill = rows[0];

        await hooks.skills.syncProperties(tx, targetId, { impactedByWeight, usableWithoutTraining });

        if (skill.name !== body.name) {
          await hooks.skills.deleteSkillFeat(tx, rulesetId, rulesetData, skill.name);
          await hooks.skills.generateSkillFeat(tx, rulesetId, sourceChain, body.name);
        }

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

        return { ...updatedSkill, impactedByWeight, usableWithoutTraining };
      });
    });
    invalidateRuleset(rulesetId);
    return result;
  }

  async deleteSkill(session: Session, rulesetId: string, skillId: string) {
    const result = await withTransaction(async (tx) => {
      return await withRulesetScope(tx, rulesetId, async ({ ruleset, rulesetData }) => {
        const { sourceChain } = rulesetData.cow;

        const inUse = await hasCharacterPicks(tx, "skills", skillId, rulesetId);
        (await RulesetsPolicy.for(tx, session, ruleset)).canDeleteEntity({ inUse });

        const skill = findScopedEntity(rulesetData.skillsById, skillId, rulesetId, sourceChain, "Skill");

        const targetId = await cowEntityToDelete(tx, ruleset, sourceChain, "skills", skill);

        const hooks = RulesetFactory.fromBaseRules(ruleset.baseRules).hooks;
        await hooks.skills.deleteSkillFeat(tx, rulesetId, rulesetData, skill.name);

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
      });
    });
    invalidateRuleset(rulesetId);
    return result;
  }
}

export default new SkillsService();
