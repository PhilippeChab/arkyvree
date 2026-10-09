import { getTableName } from "drizzle-orm";

import { klassLevelsInRules } from "@/drizzle/schema.ts";
import {
  describeClassFeatPools,
  describeClassLevel,
  describeClassLevels,
  describeClassLevelWithClass,
  planClassLevelCreate,
  planClassLevelDelete,
  planClassLevelEdit,
} from "@/engine/index.ts";
import { include } from "@/lib/mixins.ts";
import { RulesetCache, withRulesetScope } from "@/server/cache/rulesetCache/index.ts";
import { hasCharacterPicks, RulesetEdit } from "@/server/cow/index.ts";
import { db, withTransaction } from "@/server/database/index.ts";
import { KlassLevelFeats, KlassLevels, KlassLevelSaves } from "@/server/repositories/index.ts";
import { createActivityWithNotifications } from "@/server/services/activities/index.ts";
import { RulesetsPolicy } from "@/server/services/policies/index.ts";
import { writeEntityWrites } from "@/server/services/rulesets/entityWrites.ts";
import type { Session } from "@/shared/relations.ts";

import { ListsSpells } from "./concerns/ListsSpells.ts";

/** A class level's body: the feats it grants, its saves' base bonuses, and its fields (`planClassLevelCreate`). */
type ClassLevelBody = Omit<Parameters<typeof planClassLevelCreate>[2], "level">;

class ClassLevelsService extends include(Object, ListsSpells) {
  async createClassLevel(
    session: Session,
    rulesetId: string,
    classId: string,
    body: ClassLevelBody & { level: number },
  ) {
    const result = await withTransaction(
      async (tx) =>
        await withRulesetScope(tx, rulesetId, async (scope) => {
          const { ruleset, rulesetData } = scope;

          (await RulesetsPolicy.for(tx, session, ruleset)).canUpdateEntity();
          const plan = planClassLevelCreate(scope, classId, body);
          const { klass } = plan;

          // Copy an inherited class: the new level row would otherwise belong to the parent ruleset's class.
          const edit = new RulesetEdit(ruleset, rulesetData.cow);
          const { id: targetKlassId } = await edit.cowToEdit(tx, "klasses", klass);

          const rows = await KlassLevels.create(tx, { ...plan.columns, klassId: targetKlassId });
          const klassLevel = rows[0];
          const entity = { entityId: klassLevel.id, entityType: "klass_levels" } as const;

          for (const feat of plan.feats ?? [])
            await KlassLevelFeats.create(tx, { klassLevelId: klassLevel.id, ...feat });
          await KlassLevelSaves.createMany(
            tx,
            (plan.saves ?? []).map((save) => ({ klassLevelId: klassLevel.id, ...save })),
          );

          await writeEntityWrites(tx, scope, entity, plan.writes);

          await createActivityWithNotifications(tx, {
            userId: session.userId,
            targetId: klassLevel.id,
            targetTable: getTableName(klassLevelsInRules),
            type: "createKlassLevel",
            data: { entityName: klass.name, level: klassLevel.level },
          });

          return plan.describe(klassLevel);
        }),
    );
    RulesetCache.invalidate(rulesetId);
    return result;
  }

  async deleteClassLevel(session: Session, rulesetId: string, classId: string, levelId: string) {
    const result = await withTransaction(
      async (tx) =>
        await withRulesetScope(tx, rulesetId, async (scope) => {
          const { ruleset, rulesetData } = scope;

          const inUse = await hasCharacterPicks(tx, "klass_levels", levelId, rulesetId);
          (await RulesetsPolicy.for(tx, session, ruleset)).canDeleteEntity({ inUse });
          const { klass, level } = planClassLevelDelete(scope, classId, levelId);

          // COW the parent klass if the level is inherited — without this, hard-delete
          // would wipe the parent ruleset's row. RulesetEdit.cowOwner on
          // "klass_levels" duplicates the entire klass into the user's ruleset and
          // returns the level id in the new copy.
          const edit = new RulesetEdit(ruleset, rulesetData.cow);
          const resolvedLevelId = await edit.cowOwner(tx, "klass_levels", level.id);

          // FK CASCADE on klass_level_feats / klass_level_powers / klass_level_saves
          // wipes those join rows when the level row is deleted.
          // The database deletes its customizations with it.
          const rows = await KlassLevels.delete(tx, { id: resolvedLevelId });
          const deletedLevel = rows[0];

          await createActivityWithNotifications(tx, {
            userId: session.userId,
            targetId: deletedLevel.id,
            targetTable: getTableName(klassLevelsInRules),
            type: "deleteKlassLevel",
            data: { rulesetId, entityName: klass.name, level: deletedLevel.level },
          });

          return deletedLevel;
        }),
    );
    RulesetCache.invalidate(rulesetId);
    return result;
  }

  async getClassLevel(rulesetId: string, classId: string, levelId: string) {
    return await withRulesetScope(db, rulesetId, async (scope) => describeClassLevel(scope, classId, levelId));
  }

  async getClassLevelFeatPools(rulesetId: string, classId: string) {
    return await withRulesetScope(db, rulesetId, async (scope) => describeClassFeatPools(scope, classId));
  }

  async getClassLevels(rulesetId: string, classId: string) {
    return await withRulesetScope(db, rulesetId, async (scope) => describeClassLevels(scope, classId));
  }

  async getClassLevelWithClassName(rulesetId: string, classLevelId: string) {
    return await withRulesetScope(db, rulesetId, async (scope) => describeClassLevelWithClass(scope, classLevelId));
  }

  async updateClassLevel(session: Session, rulesetId: string, classId: string, levelId: string, body: ClassLevelBody) {
    const result = await withTransaction(
      async (tx) =>
        await withRulesetScope(tx, rulesetId, async (scope) => {
          const { ruleset, rulesetData } = scope;

          (await RulesetsPolicy.for(tx, session, ruleset)).canUpdateEntity();
          const plan = planClassLevelEdit(scope, classId, levelId, body);
          const { klass, level } = plan;

          // COW the parent klass if inherited so writes don't corrupt the parent.
          const edit = new RulesetEdit(ruleset, rulesetData.cow);
          const resolvedLevelId = await edit.cowOwner(tx, "klass_levels", level.id);

          const entity = { entityId: resolvedLevelId, entityType: "klass_levels" } as const;
          await writeEntityWrites(tx, scope, entity, plan.writes);

          if (plan.feats !== undefined) {
            await KlassLevelFeats.delete(tx, { klassLevelId: resolvedLevelId });
            await KlassLevelFeats.createMany(
              tx,
              plan.feats.map((feat) => ({ klassLevelId: resolvedLevelId, ...feat })),
            );
          }

          if (plan.saves !== undefined) {
            await KlassLevelSaves.delete(tx, { klassLevelId: resolvedLevelId });
            await KlassLevelSaves.createMany(
              tx,
              plan.saves.map((save) => ({ klassLevelId: resolvedLevelId, ...save })),
            );
          }

          await createActivityWithNotifications(tx, {
            userId: session.userId,
            targetId: resolvedLevelId,
            targetTable: getTableName(klassLevelsInRules),
            type: "updateKlassLevel",
            data: { entityName: klass.name, level: level.level },
          });

          return plan.describe(resolvedLevelId);
        }),
    );
    RulesetCache.invalidate(rulesetId);
    return result;
  }
}

export default new ClassLevelsService();
