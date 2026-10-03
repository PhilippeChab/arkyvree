import { getTableName } from "drizzle-orm";

import { klassSkillsInRules } from "@/drizzle/schema.ts";
import { invalidateRuleset } from "@/server/cache/rulesetCache.ts";
import { db, withTransaction } from "@/server/database/index.ts";
import { ConflictError, NotFoundError } from "@/server/errors/index.ts";
import { KlassSkills } from "@/server/repositories/index.ts";
import { createActivityWithNotifications } from "@/server/services/activityNotifications.ts";
import BaseService from "@/server/services/BaseService.ts";
import {
  entityHasCharacterPicks,
  entityToEdit,
  findScopedEntity,
  withRulesetScope,
} from "@/server/services/rulesets/cow.ts";
import { getRulesetPolicy } from "@/server/services/rulesets/helpers.ts";
import type { Session } from "@/shared/relations.ts";

const ClassSkillsMethods = {
  async getClassSkills(rulesetId: string, classId: string) {
    return await withRulesetScope(db, rulesetId, async ({ rulesetData }) => {
      const { sourceChain } = rulesetData.cow;
      const klass = findScopedEntity(rulesetData.klassesById, classId, rulesetId, sourceChain, "Class");
      return rulesetData.klassSkillsWithSkillsByKlass.get(klass.id) ?? [];
    });
  },

  async addClassSkill(session: Session, rulesetId: string, classId: string, skillId: string) {
    let klassRulesetId: string | undefined;
    const result = await withTransaction(async (tx) => {
      return await withRulesetScope(tx, rulesetId, async ({ ruleset, rulesetData }) => {
        const { sourceChain } = rulesetData.cow;

        (await getRulesetPolicy(tx, session, ruleset)).canUpdateEntity();

        const klass = findScopedEntity(rulesetData.klassesById, classId, rulesetId, sourceChain, "Class");
        klassRulesetId = klass.rulesetId;

        const skill = findScopedEntity(rulesetData.skillsById, skillId, rulesetId, sourceChain, "Skill");

        const existing = rulesetData.klassSkillsByKlassId.get(klass.id)?.some((ks) => ks.skillId === skill.id);
        if (existing) {
          throw new ConflictError("Skill is already assigned to this class");
        }

        // Copy an inherited class: the new klass_skills row would otherwise point at the parent ruleset's class.
        const { id: targetKlassId } = await entityToEdit(tx, ruleset, sourceChain, "klasses", klass);

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
      });
    });
    invalidateRuleset(rulesetId);
    if (klassRulesetId && klassRulesetId !== rulesetId) invalidateRuleset(klassRulesetId);
    return result;
  },

  async removeClassSkill(session: Session, rulesetId: string, classId: string, skillId: string) {
    let klassRulesetId: string | undefined;
    const result = await withTransaction(async (tx) => {
      return await withRulesetScope(tx, rulesetId, async ({ ruleset, rulesetData }) => {
        const { sourceChain } = rulesetData.cow;

        const inUse = await entityHasCharacterPicks(tx, "klasses", classId, rulesetId);
        (await getRulesetPolicy(tx, session, ruleset)).canDeleteEntity({ inUse });

        const klass = findScopedEntity(rulesetData.klassesById, classId, rulesetId, sourceChain, "Class");
        klassRulesetId = klass.rulesetId;

        const klassSkill = rulesetData.klassSkillsByKlassId.get(klass.id)?.find((ks) => ks.skillId === skillId);
        if (!klassSkill) {
          throw new NotFoundError("Skill is not assigned to this class");
        }

        const skill = rulesetData.skillsById.get(skillId);

        // Copy an inherited class: the delete would otherwise remove the parent ruleset's klass_skills row.
        const { id: targetKlassId } = await entityToEdit(tx, ruleset, sourceChain, "klasses", klass);

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
      });
    });
    invalidateRuleset(rulesetId);
    if (klassRulesetId && klassRulesetId !== rulesetId) invalidateRuleset(klassRulesetId);
    return result;
  },
} as const;

class ClassSkillsService extends BaseService<typeof ClassSkillsMethods> {
  static initialize() {
    return new ClassSkillsService(ClassSkillsMethods);
  }
}

export default ClassSkillsService;
