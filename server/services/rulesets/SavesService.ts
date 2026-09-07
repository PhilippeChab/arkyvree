import { savesInRules } from "@/drizzle/schema.ts";
import { db, withTransaction } from "@/server/database/index.ts";
import { ConflictError, NotFoundError, STALE_ENTITY_MESSAGE } from "@/server/errors/index.ts";
import { KlassLevelSaves, Saves } from "@/server/repositories/index.ts";
import { invalidateRuleset } from "@/server/cache/rulesetCache.ts";
import BaseService from "@/server/services/BaseService.ts";
import { createActivityWithNotifications, getChangedFields } from "@/server/services/activityNotifications.ts";
import {
  assertEntityNameAvailable,
  cowEntity,
  deleteModifiersWithCascade,
  deletePropertiesWithCascade,
  deleteRequirementsWithCascade,
  repointTombstoneSnapshot,
  withRulesetScope,
} from "@/server/services/rulesets/cow.ts";
import { getRulesetPolicy } from "@/server/services/rulesets/helpers.ts";
import type { Session } from "@/shared/relations.ts";
import { getTableName } from "drizzle-orm";

export const SavesMethods = {
  async getRulesetSaves(
    rulesetId: string,
    where: { childOnly?: boolean; search?: string; orderBy?: "name" | "createdAt" | "updatedAt"; orderDir?: "asc" | "desc" },
    pagination: { limit: number; page: number },
  ) {
    return await withRulesetScope(db, rulesetId, async ({ rulesetData }) => {
      const { sourceChain } = rulesetData.cow;
      return await Saves.findManyByRulesetId(db, { rulesetId, ancestorRulesetIds: sourceChain, ...where }, pagination);
    });
  },

  async getRulesetSave(rulesetId: string, saveId: string) {
    return await withRulesetScope(db, rulesetId, async ({ rulesetData }) => {
      const { sourceChain } = rulesetData.cow;
      const save = rulesetData.savesById.get(saveId);
      if (!save || (save.rulesetId !== rulesetId && !sourceChain.includes(save.rulesetId))) {
        throw new NotFoundError("Save not found in this ruleset");
      }
      return save;
    });
  },

  async createRulesetSave(session: Session, rulesetId: string, body: {
    name: string;
    description?: string | null;
    abilityId: string;
  }) {
    const result = await withTransaction(async (tx) => {
      return await withRulesetScope(tx, rulesetId, async ({ ruleset, rulesetData }) => {
        const { sourceChain } = rulesetData.cow;

        (await getRulesetPolicy(tx, session, ruleset)).canUpdateEntity();

        const { tombstoneAncestorId } = await assertEntityNameAvailable(tx, rulesetId, sourceChain, "saves", body.name);

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
  },

  async updateRulesetSave(session: Session, rulesetId: string, saveId: string, body: {
    name: string;
    description?: string | null;
    abilityId: string;
    updatedAt?: string;
  }) {
    const result = await withTransaction(async (tx) => {
      return await withRulesetScope(tx, rulesetId, async ({ ruleset, rulesetData }) => {
        const { sourceChain } = rulesetData.cow;

        (await getRulesetPolicy(tx, session, ruleset)).canUpdateEntity();

        const save = rulesetData.savesById.get(saveId);
        const isOwned = save && save.rulesetId === rulesetId;
        const isInherited = save && sourceChain.includes(save.rulesetId);
        if (!save || (!isOwned && !isInherited)) {
          throw new NotFoundError("Save not found in this ruleset");
        }

        let targetId = save.id;
        const expectedUpdatedAt = isOwned ? body.updatedAt : undefined;
        if (isInherited) {
          const cowResult = await cowEntity(tx, "saves", save.id, rulesetId, sourceChain);
          targetId = cowResult.id as string;
        }

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
          data: { entityName: body.name, changedFields: getChangedFields(save as Record<string, unknown>, body as Record<string, unknown>) },
        });

        return updatedSave;
      });
    });
    invalidateRuleset(rulesetId);
    return result;
  },

  async deleteRulesetSave(session: Session, rulesetId: string, saveId: string) {
    const result = await withTransaction(async (tx) => {
      return await withRulesetScope(tx, rulesetId, async ({ ruleset, rulesetData }) => {
        const { sourceChain } = rulesetData.cow;

        const save = rulesetData.savesById.get(saveId);
        const isOwned = save && save.rulesetId === rulesetId;
        const isInherited = save && sourceChain.includes(save.rulesetId);
        if (!save || (!isOwned && !isInherited)) {
          throw new NotFoundError("Save not found in this ruleset");
        }

        // Saves don't have a character-pick path — class-side check instead.
        // klass_level_saves.save_id is ON DELETE RESTRICT, so this is just for
        // the friendlier error.
        const inUse = await KlassLevelSaves.existsBySaveId(tx, { saveId: save.id });
        (await getRulesetPolicy(tx, session, ruleset)).canDeleteEntity({ inUse });

        let targetId = save.id;
        if (isInherited) {
          const cowResult = await cowEntity(tx, "saves", save.id, rulesetId, sourceChain);
          targetId = cowResult.id as string;
        }

        // Customizations are polymorphic FKs — Postgres can't cascade these.
        await deleteModifiersWithCascade(tx, { sourceIds: [targetId], sourceType: "saves" });
        await deletePropertiesWithCascade(tx, { entityIds: [targetId], entityType: "saves" });
        await deleteRequirementsWithCascade(tx, { entityIds: [targetId], entityType: "saves" });

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
  },
} as const;

class SavesService extends BaseService<typeof SavesMethods> {
  static initialize() {
    return new SavesService(SavesMethods);
  }
}

export default SavesService;
