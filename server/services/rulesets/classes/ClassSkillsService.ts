import { klassSkillsInRules } from "@/drizzle/schema.ts";
import { invalidateRuleset } from "@/server/cache/rulesetCache.ts";
import { db, withTransaction } from "@/server/database/index.ts";
import { ConflictError, NotFoundError } from "@/server/errors/index.ts";
import { KlassSkills } from "@/server/repositories/index.ts";
import BaseService from "@/server/services/BaseService.ts";
import { createActivityWithNotifications } from "@/server/services/activityNotifications.ts";
import { cowEntity, entityHasCharacterPicks, withRulesetScope } from "@/server/services/rulesets/cow.ts";
import { getRulesetPolicy } from "@/server/services/rulesets/helpers.ts";
import type { Session } from "@/shared/relations.ts";
import { getTableName } from "drizzle-orm";

export const ClassSkillsMethods = {
  async getClassSkills(rulesetId: string, classId: string) {
    return await withRulesetScope(db, rulesetId, async ({ rulesetData }) => {
      const { sourceChain } = rulesetData.cow;
      const klass = rulesetData.klassesById.get(classId);
      if (!klass || (klass.rulesetId !== rulesetId && !sourceChain.includes(klass.rulesetId))) {
        throw new NotFoundError("Class not found in this ruleset");
      }
      return rulesetData.klassSkillsWithSkillsByKlass.get(klass.id) ?? [];
    });
  },

  async addClassSkill(session: Session, rulesetId: string, classId: string, skillId: string) {
    let klassRulesetId: string | undefined;
    const result = await withTransaction(async (tx) => {
      return await withRulesetScope(tx, rulesetId, async ({ ruleset, rulesetData }) => {
        const { sourceChain } = rulesetData.cow;
        const rulesetIds = new Set([rulesetId, ...sourceChain]);

        (await getRulesetPolicy(tx, session, ruleset)).canUpdateEntity();

        const klass = rulesetData.klassesById.get(classId);
        if (!klass || !rulesetIds.has(klass.rulesetId)) {
          throw new NotFoundError("Class not found in this ruleset");
        }
        klassRulesetId = klass.rulesetId;

        const skill = rulesetData.skillsById.get(skillId);
        if (!skill || !rulesetIds.has(skill.rulesetId)) {
          throw new NotFoundError("Skill not found in this ruleset");
        }

        const existing = rulesetData.klassSkillsByKlassId.get(klass.id)?.some((ks) => ks.skillId === skill.id);
        if (existing) {
          throw new ConflictError("Skill is already assigned to this class");
        }

        // COW the klass if inherited — without this, the new klass_skills row
        // would point at the parent ruleset's klass.
        let targetKlassId = klass.id;
        if (klass.rulesetId !== rulesetId) {
          const cowResult = await cowEntity(tx, "klasses", klass.id, rulesetId, sourceChain);
          targetKlassId = cowResult.id as string;
        }

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

        const klass = rulesetData.klassesById.get(classId);
        if (!klass || (klass.rulesetId !== rulesetId && !sourceChain.includes(klass.rulesetId))) {
          throw new NotFoundError("Class not found in this ruleset");
        }
        klassRulesetId = klass.rulesetId;

        const klassSkill = rulesetData.klassSkillsByKlassId.get(klass.id)?.find((ks) => ks.skillId === skillId);
        if (!klassSkill) {
          throw new NotFoundError("Skill is not assigned to this class");
        }

        const skill = rulesetData.skillsById.get(skillId);

        // COW the klass if inherited — otherwise hard-delete would wipe the
        // klass_skills row from the parent ruleset.
        let targetKlassId = klass.id;
        if (klass.rulesetId !== rulesetId) {
          const cowResult = await cowEntity(tx, "klasses", klass.id, rulesetId, sourceChain);
          targetKlassId = cowResult.id as string;
        }

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
