import { type ClassEngine, Engine } from "@/engine/index.ts";
import { include } from "@/lib/mixins.ts";
import { CustomizationEdit, EntityEdit, RulesetViews, withRulesetScope } from "@/server/cow/index.ts";
import { db, withTransaction } from "@/server/database/index.ts";
import { ConflictError, STALE_ENTITY_MESSAGE } from "@/server/errors/index.ts";
import { KlassLevelFeats, KlassLevels, KlassLevelSaves } from "@/server/repositories/index.ts";
import { createActivityWithNotifications } from "@/server/services/activities/index.ts";
import { RulesetsPolicy } from "@/server/services/policies/index.ts";
import { hasCharacterPicks } from "@/server/services/rulesets/characterPicks.ts";
import { writeEntityWrites } from "@/server/services/rulesets/entityWrites.ts";
import type { Session } from "@/shared/relations.ts";

import { ListsSpells } from "./concerns/ListsSpells.ts";
import { writeLevelEdit } from "./levelEdits.ts";

/**
 * A class level's body: its fields, and what its class's rules read (a new level's number, the feats it grants, its
 * saves' base bonuses: `planLevelCreate`).
 */
type ClassLevelBody = Parameters<ClassEngine["planLevelCreate"]>[0];

class ClassLevelsService extends include(Object, ListsSpells) {
  async createClassLevel(session: Session, rulesetId: string, classId: string, body: ClassLevelBody) {
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

          if (plan.writes) await writeEntityWrites(tx, scope, entity, plan.writes);

          await createActivityWithNotifications(tx, {
            userId: session.userId,
            targetId: klassLevel.id,
            targetTable: "klass_levels",
            type: "createKlassLevel",
            data: { entityName: klass.name, level: klassLevel.level },
          });

          return { ...klassLevel, ...plan.fields };
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
          const { entity: level, klass } = Engine.for(scope).class(classId).planLevelDelete(levelId);

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
            targetTable: "klass_levels",
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
      Engine.for(scope).entities("klasses").describeLevel(classLevelId),
    );
  }

  async updateClassLevel(
    session: Session,
    rulesetId: string,
    classId: string,
    levelId: string,
    body: ClassLevelBody & { updatedAt?: string },
  ) {
    const { updatedAt, ...form } = body;
    const result = await withTransaction(
      async (tx) =>
        await withRulesetScope(tx, rulesetId, async (scope) => {
          const { ruleset, rulesetData } = scope;

          (await RulesetsPolicy.for(tx, session, ruleset)).canUpdateEntity();
          const plan = Engine.for(scope).class(classId).planLevelEdit(levelId, form);
          const { entity: level, klass } = plan;

          // COW the parent klass if inherited so writes don't corrupt the parent.
          const edit = new CustomizationEdit(ruleset, rulesetData.cow);
          const resolvedLevelId = await edit.cowOwner(tx, "klass_levels", level.id);

          // The edit moves the level's `updatedAt`, refused when stale (a copy's never is: its token is the source's)
          const expectedUpdatedAt = resolvedLevelId === level.id ? updatedAt : undefined;
          const rows = await KlassLevels.update(tx, {}, { id: resolvedLevelId, expectedUpdatedAt });
          if (expectedUpdatedAt && rows.length === 0) throw new ConflictError(STALE_ENTITY_MESSAGE);

          await writeLevelEdit(tx, scope, resolvedLevelId, plan);

          await createActivityWithNotifications(tx, {
            userId: session.userId,
            targetId: resolvedLevelId,
            targetTable: "klass_levels",
            type: "updateKlassLevel",
            data: { entityName: klass.name, level: level.level },
          });

          return { ...rows[0], ...plan.fields };
        }),
    );
    RulesetViews.invalidate(rulesetId);
    return result;
  }
}

export default new ClassLevelsService();
