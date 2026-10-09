import { getTableName } from "drizzle-orm";

import { klassLevelsInRules } from "@/drizzle/schema.ts";
import { type ClassEngine, Engine } from "@/engine/index.ts";
import { include } from "@/lib/mixins.ts";
import { CustomizationEdit, EntityEdit, RulesetViews, withRulesetScope } from "@/server/cow/index.ts";
import { db, withTransaction } from "@/server/database/index.ts";
import { KlassLevelFeats, KlassLevels, KlassLevelSaves } from "@/server/repositories/index.ts";
import { createActivityWithNotifications } from "@/server/services/activities/index.ts";
import { RulesetsPolicy } from "@/server/services/policies/index.ts";
import { hasCharacterPicks } from "@/server/services/rulesets/characterPicks.ts";
import { writeEntityWrites } from "@/server/services/rulesets/entityWrites.ts";
import type { Session } from "@/shared/relations.ts";

import { ListsSpells } from "./concerns/ListsSpells.ts";

/** A class level's body: the feats it grants, its saves' base bonuses, and its fields (`planClassLevelCreate`). */
type ClassLevelBody = Omit<Parameters<ClassEngine["planLevelCreate"]>[0], "level">;

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
          const { ruleset } = scope;

          (await RulesetsPolicy.for(tx, session, ruleset)).canUpdateEntity();
          const plan = Engine.for(scope).class(classId).planLevelCreate(body);
          const { klass } = plan;

          // Copy an inherited class: the new level row would otherwise belong to the parent ruleset's class.
          const edit = new EntityEdit(ruleset);
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
    RulesetViews.invalidate(rulesetId);
    return result;
  }

  async deleteClassLevel(session: Session, rulesetId: string, classId: string, levelId: string) {
    const result = await withTransaction(
      async (tx) =>
        await withRulesetScope(tx, rulesetId, async (scope) => {
          const { ruleset, rulesetData } = scope;

          const inUse = await hasCharacterPicks(
            tx,
            "klass_levels",
            scope.rulesetData.cow.getEquivalentIds(levelId),
            rulesetId,
          );
          (await RulesetsPolicy.for(tx, session, ruleset)).canDeleteEntity({ inUse });
          const { klass, level } = Engine.for(scope).class(classId).planLevelDelete(levelId);

          // COW the parent klass if the level is inherited — without this, hard-delete
          // would wipe the parent ruleset's row. CustomizationEdit.cowOwner on
          // "klass_levels" duplicates the entire klass into the user's ruleset and
          // returns the level id in the new copy.
          const edit = new CustomizationEdit(ruleset, rulesetData.cow);
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
    RulesetViews.invalidate(rulesetId);
    return result;
  }

  async getClassLevel(rulesetId: string, classId: string, levelId: string) {
    return await withRulesetScope(db, rulesetId, async (scope) =>
      Engine.for(scope).class(classId).describeLevel(levelId),
    );
  }

  async getClassLevelFeatPools(rulesetId: string, classId: string) {
    return await withRulesetScope(db, rulesetId, async (scope) => Engine.for(scope).class(classId).describeFeatPools());
  }

  async getClassLevels(rulesetId: string, classId: string) {
    return await withRulesetScope(db, rulesetId, async (scope) => Engine.for(scope).class(classId).describeLevels());
  }

  async getClassLevelWithClassName(rulesetId: string, classLevelId: string) {
    return await withRulesetScope(db, rulesetId, async (scope) =>
      Engine.for(scope).classes().describeLevel(classLevelId),
    );
  }

  async updateClassLevel(session: Session, rulesetId: string, classId: string, levelId: string, body: ClassLevelBody) {
    const result = await withTransaction(
      async (tx) =>
        await withRulesetScope(tx, rulesetId, async (scope) => {
          const { ruleset, rulesetData } = scope;

          (await RulesetsPolicy.for(tx, session, ruleset)).canUpdateEntity();
          const plan = Engine.for(scope).class(classId).planLevelEdit(levelId, body);
          const { klass, level } = plan;

          // COW the parent klass if inherited so writes don't corrupt the parent.
          const edit = new CustomizationEdit(ruleset, rulesetData.cow);
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
    RulesetViews.invalidate(rulesetId);
    return result;
  }
}

export default new ClassLevelsService();
