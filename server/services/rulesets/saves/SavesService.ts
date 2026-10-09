import { getTableName } from "drizzle-orm";

import { savesInRules } from "@/drizzle/schema.ts";
import { Engine } from "@/engine/index.ts";
import { EntityEdit, EntityNames, RulesetViews, withRulesetScope } from "@/server/cow/index.ts";
import { db, withTransaction } from "@/server/database/index.ts";
import { ConflictError, STALE_ENTITY_MESSAGE } from "@/server/errors/index.ts";
import { KlassLevelSaves, Saves } from "@/server/repositories/index.ts";
import { createActivityWithNotifications, getChangedFields } from "@/server/services/activities/index.ts";
import { RulesetsPolicy } from "@/server/services/policies/index.ts";
import type { Session } from "@/shared/relations.ts";

class SavesService {
  async createSave(
    session: Session,
    rulesetId: string,
    body: {
      abilityId: string;
      description?: string | null;
      name: string;
    },
  ) {
    const result = await withTransaction(
      async (tx) =>
        await withRulesetScope(tx, rulesetId, async (scope) => {
          const { ruleset, rulesetData } = scope;
          (await RulesetsPolicy.for(tx, session, ruleset)).canUpdateEntity();

          const plan = Engine.for(scope).entities("saves").planCreate(body);
          const names = new EntityNames(ruleset, rulesetData.cow);
          const { tombstoneAncestorId } = await names.assertNameAvailable(tx, "saves", plan.name);

          const rows = await Saves.create(tx, { ...plan.columns, rulesetId });
          const save = rows[0];

          if (tombstoneAncestorId) await names.repointTombstone(tx, "saves", tombstoneAncestorId, save.id);

          await createActivityWithNotifications(tx, {
            userId: session.userId,
            targetId: save.id,
            targetTable: getTableName(savesInRules),
            type: "createSave",
            data: { entityName: save.name },
          });

          return save;
        }),
    );
    RulesetViews.invalidate(rulesetId);
    return result;
  }

  async deleteSave(session: Session, rulesetId: string, saveId: string) {
    const result = await withTransaction(
      async (tx) =>
        await withRulesetScope(tx, rulesetId, async (scope) => {
          const { ruleset } = scope;

          const { entity: save } = Engine.for(scope).entities("saves").planDelete(saveId);

          // Saves don't have a character-pick path — class-side check instead.
          // klass_level_saves.save_id is ON DELETE RESTRICT, so this is just for
          // the friendlier error.
          const inUse = await KlassLevelSaves.exists(tx, { saveId: save.id });
          (await RulesetsPolicy.for(tx, session, ruleset)).canDeleteEntity({ inUse });

          const edit = new EntityEdit(ruleset);
          const targetId = await edit.cowToDelete(tx, "saves", save);

          // The database deletes its customizations with it.
          const rows = await Saves.delete(tx, { id: targetId });
          const deletedSave = rows[0];

          await createActivityWithNotifications(tx, {
            userId: session.userId,
            targetId,
            targetTable: getTableName(savesInRules),
            type: "deleteSave",
            data: { rulesetId, entityName: save.name },
          });

          return deletedSave;
        }),
    );
    RulesetViews.invalidate(rulesetId);
    return result;
  }

  async getSave(rulesetId: string, saveId: string) {
    return await withRulesetScope(db, rulesetId, async (scope) => {
      const save = Engine.for(scope).entities("saves").describe(saveId);
      return save;
    });
  }

  async getSaves(
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
      const result = await Saves.findPage(
        db,
        { rulesetId, ...scope.rulesetData.cow.listFilters, ...where },
        pagination,
      );
      return { ...result, items: Engine.for(scope).entities("saves").describePage(result.items) };
    });
  }

  async updateSave(
    session: Session,
    rulesetId: string,
    saveId: string,
    body: {
      abilityId: string;
      description?: string | null;
      name: string;
      updatedAt?: string;
    },
  ) {
    const result = await withTransaction(
      async (tx) =>
        await withRulesetScope(tx, rulesetId, async (scope) => {
          const { ruleset } = scope;

          (await RulesetsPolicy.for(tx, session, ruleset)).canUpdateEntity();

          const { columns, entity: save } = Engine.for(scope).entities("saves").planEdit(saveId, body);

          const edit = new EntityEdit(ruleset);
          const { id: targetId, copied } = await edit.cowToEdit(tx, "saves", save);
          const expectedUpdatedAt = copied ? undefined : body.updatedAt;

          const rows = await Saves.update(tx, columns, { id: targetId, expectedUpdatedAt });
          if (expectedUpdatedAt && rows.length === 0) throw new ConflictError(STALE_ENTITY_MESSAGE);

          const updatedSave = rows[0];

          await createActivityWithNotifications(tx, {
            userId: session.userId,
            targetId,
            targetTable: getTableName(savesInRules),
            type: "updateSave",
            data: {
              entityName: body.name,
              changedFields: getChangedFields(save, body),
            },
          });

          return updatedSave;
        }),
    );
    RulesetViews.invalidate(rulesetId);
    return result;
  }
}

export default new SavesService();
