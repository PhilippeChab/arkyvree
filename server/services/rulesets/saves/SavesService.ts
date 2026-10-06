import { getTableName } from "drizzle-orm";

import { savesInRules } from "@/drizzle/schema.ts";
import { findScopedEntity, RulesetCache } from "@/server/cache/rulesetCache/index.ts";
import { withRulesetScope } from "@/server/cache/rulesetCache/index.ts";
import { RulesetEdit } from "@/server/cow/index.ts";
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
      name: string;
      description?: string | null;
      abilityId: string;
    },
  ) {
    const result = await withTransaction(async (tx) => {
      return await withRulesetScope(tx, rulesetId, async ({ ruleset, rulesetData }) => {
        (await RulesetsPolicy.for(tx, session, ruleset)).canUpdateEntity();

        const edit = new RulesetEdit(ruleset, rulesetData.cow);
        const { tombstoneAncestorId } = await edit.assertNameAvailable(tx, "saves", body.name);

        const rows = await Saves.create(tx, { ...body, rulesetId });
        const save = rows[0];

        if (tombstoneAncestorId) {
          await edit.repointTombstone(tx, "saves", tombstoneAncestorId, save.id);
        }

        await createActivityWithNotifications(tx, {
          userId: session.userId,
          targetId: save.id,
          targetTable: getTableName(savesInRules),
          type: "createSave",
          data: { entityName: save.name },
        });

        return save;
      });
    });
    RulesetCache.invalidate(rulesetId);
    return result;
  }

  async deleteSave(session: Session, rulesetId: string, saveId: string) {
    const result = await withTransaction(async (tx) => {
      return await withRulesetScope(tx, rulesetId, async ({ ruleset, rulesetData }) => {
        const { sourceChain } = rulesetData.cow;

        const save = findScopedEntity(rulesetData.savesById, saveId, rulesetId, sourceChain, "Save");

        // Saves don't have a character-pick path — class-side check instead.
        // klass_level_saves.save_id is ON DELETE RESTRICT, so this is just for
        // the friendlier error.
        const inUse = await KlassLevelSaves.exists(tx, { saveId: save.id });
        (await RulesetsPolicy.for(tx, session, ruleset)).canDeleteEntity({ inUse });

        const edit = new RulesetEdit(ruleset, rulesetData.cow);
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
      });
    });
    RulesetCache.invalidate(rulesetId);
    return result;
  }

  async getSave(rulesetId: string, saveId: string) {
    return await withRulesetScope(db, rulesetId, async ({ rulesetData }) => {
      const { sourceChain } = rulesetData.cow;
      const save = findScopedEntity(rulesetData.savesById, saveId, rulesetId, sourceChain, "Save");
      return save;
    });
  }

  async getSaves(
    rulesetId: string,
    where: {
      childOnly?: boolean;
      search?: string;
      orderBy?: "name" | "createdAt" | "updatedAt";
      orderDir?: "asc" | "desc";
    },
    pagination: { limit: number; page: number },
  ) {
    return await withRulesetScope(db, rulesetId, async ({ rulesetData }) => {
      const { sourceChain } = rulesetData.cow;
      return await Saves.findPage(db, { rulesetId, ancestorRulesetIds: sourceChain, ...where }, pagination);
    });
  }

  async updateSave(
    session: Session,
    rulesetId: string,
    saveId: string,
    body: {
      name: string;
      description?: string | null;
      abilityId: string;
      updatedAt?: string;
    },
  ) {
    const result = await withTransaction(async (tx) => {
      return await withRulesetScope(tx, rulesetId, async ({ ruleset, rulesetData }) => {
        const { sourceChain } = rulesetData.cow;

        (await RulesetsPolicy.for(tx, session, ruleset)).canUpdateEntity();

        const save = findScopedEntity(rulesetData.savesById, saveId, rulesetId, sourceChain, "Save");

        const edit = new RulesetEdit(ruleset, rulesetData.cow);
        const { id: targetId, copied } = await edit.cowToEdit(tx, "saves", save);
        const expectedUpdatedAt = copied ? undefined : body.updatedAt;

        const { updatedAt: _u, ...saveData } = body;
        const rows = await Saves.update(tx, saveData, { id: targetId, expectedUpdatedAt });
        if (expectedUpdatedAt && rows.length === 0) {
          throw new ConflictError(STALE_ENTITY_MESSAGE);
        }
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
      });
    });
    RulesetCache.invalidate(rulesetId);
    return result;
  }
}

export default new SavesService();
