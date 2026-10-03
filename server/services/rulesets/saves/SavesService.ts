import { getTableName } from "drizzle-orm";

import { savesInRules } from "@/drizzle/schema.ts";
import { invalidateRuleset } from "@/server/cache/rulesetCache/index.ts";
import { db, withTransaction } from "@/server/database/index.ts";
import { ConflictError, STALE_ENTITY_MESSAGE } from "@/server/errors/index.ts";
import { KlassLevelSaves, Saves } from "@/server/repositories/index.ts";
import { createActivityWithNotifications, getChangedFields } from "@/server/services/activities/index.ts";
import { RulesetsPolicy } from "@/server/services/policies/index.ts";
import {
  assertEntityNameAvailable,
  entityToDelete,
  entityToEdit,
  findScopedEntity,
  repointTombstoneSnapshot,
  withRulesetScope,
} from "@/server/services/rulesets/cow/index.ts";
import type { Session } from "@/shared/relations.ts";

class SavesService {
  async getRulesetSaves(
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
      return await Saves.findManyByRulesetId(db, { rulesetId, ancestorRulesetIds: sourceChain, ...where }, pagination);
    });
  }

  async getRulesetSave(rulesetId: string, saveId: string) {
    return await withRulesetScope(db, rulesetId, async ({ rulesetData }) => {
      const { sourceChain } = rulesetData.cow;
      const save = findScopedEntity(rulesetData.savesById, saveId, rulesetId, sourceChain, "Save");
      return save;
    });
  }

  async createRulesetSave(
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

        const { tombstoneAncestorId } = await assertEntityNameAvailable(
          tx,
          rulesetId,
          rulesetData.cow,
          "saves",
          body.name,
        );

        const rows = await Saves.create(tx, { ...body, rulesetId });
        const save = rows[0];

        if (tombstoneAncestorId) {
          await repointTombstoneSnapshot(tx, rulesetId, "saves", tombstoneAncestorId, save.id);
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
    invalidateRuleset(rulesetId);
    return result;
  }

  async updateRulesetSave(
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

        const { id: targetId, copied } = await entityToEdit(tx, ruleset, sourceChain, "saves", save);
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
    invalidateRuleset(rulesetId);
    return result;
  }

  async deleteRulesetSave(session: Session, rulesetId: string, saveId: string) {
    const result = await withTransaction(async (tx) => {
      return await withRulesetScope(tx, rulesetId, async ({ ruleset, rulesetData }) => {
        const { sourceChain } = rulesetData.cow;

        const save = findScopedEntity(rulesetData.savesById, saveId, rulesetId, sourceChain, "Save");

        // Saves don't have a character-pick path — class-side check instead.
        // klass_level_saves.save_id is ON DELETE RESTRICT, so this is just for
        // the friendlier error.
        const inUse = await KlassLevelSaves.existsBySaveId(tx, { saveId: save.id });
        (await RulesetsPolicy.for(tx, session, ruleset)).canDeleteEntity({ inUse });

        const targetId = await entityToDelete(tx, ruleset, sourceChain, "saves", save);

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
    invalidateRuleset(rulesetId);
    return result;
  }
}

export default new SavesService();
