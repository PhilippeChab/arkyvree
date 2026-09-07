import { mechanicsInRules } from "@/drizzle/schema.ts";
import { db, withTransaction } from "@/server/database/index.ts";
import { ConflictError, NotFoundError, STALE_ENTITY_MESSAGE } from "@/server/errors/index.ts";
import { Mechanics } from "@/server/repositories/index.ts";
import { invalidateRuleset } from "@/server/cache/rulesetCache.ts";
import BaseService from "@/server/services/BaseService.ts";
import { createActivityWithNotifications, getChangedFields } from "@/server/services/activityNotifications.ts";
import { assertEntityNameAvailable, cowEntity, repointTombstoneSnapshot, withRulesetScope } from "@/server/services/rulesets/cow.ts";
import { getRulesetPolicy } from "@/server/services/rulesets/helpers.ts";
import type { Session } from "@/shared/relations.ts";
import { getTableName } from "drizzle-orm";

export const MechanicsMethods = {
  async getRulesetMechanics(
    rulesetId: string,
    where: { childOnly?: boolean; search?: string; orderBy?: "name" | "createdAt" | "updatedAt"; orderDir?: "asc" | "desc" },
    pagination: { limit: number; page: number },
  ) {
    return await withRulesetScope(db, rulesetId, async ({ rulesetData }) => {
      const { sourceChain } = rulesetData.cow;
      return await Mechanics.findManyByRulesetId(db, { rulesetId, ancestorRulesetIds: sourceChain, ...where }, pagination);
    });
  },

  async getRulesetMechanic(rulesetId: string, mechanicId: string) {
    return await withRulesetScope(db, rulesetId, async ({ rulesetData }) => {
      const { sourceChain } = rulesetData.cow;
      const mechanic = rulesetData.mechanicsById.get(mechanicId);
      if (!mechanic || (mechanic.rulesetId !== rulesetId && !sourceChain.includes(mechanic.rulesetId))) {
        throw new NotFoundError("Mechanic not found in this ruleset");
      }
      return mechanic;
    });
  },

  async createRulesetMechanic(session: Session, rulesetId: string, body: {
    name: string;
    description?: string | null;
  }) {
    const result = await withTransaction(async (tx) => {
      return await withRulesetScope(tx, rulesetId, async ({ ruleset, rulesetData }) => {
        const { sourceChain } = rulesetData.cow;

        (await getRulesetPolicy(tx, session, ruleset)).canUpdateEntity();

        const { tombstoneAncestorId } = await assertEntityNameAvailable(tx, rulesetId, sourceChain, "mechanics", body.name);

        const rows = await Mechanics.create(tx, { ...body, rulesetId });
        const mechanic = rows[0];

        if (tombstoneAncestorId) {
          await repointTombstoneSnapshot(tx, rulesetId, "mechanics", tombstoneAncestorId, mechanic.id);
        }

        await createActivityWithNotifications(tx, {
          userId: session.userId,
          targetId: mechanic.id,
          targetTable: getTableName(mechanicsInRules),
          type: "createMechanic",
          data: { entityName: mechanic.name },
        });

        return mechanic;
      });
    });
    invalidateRuleset(rulesetId);
    return result;
  },

  async updateRulesetMechanic(session: Session, rulesetId: string, mechanicId: string, body: {
    name: string;
    description?: string | null;
    updatedAt?: string;
  }) {
    const result = await withTransaction(async (tx) => {
      return await withRulesetScope(tx, rulesetId, async ({ ruleset, rulesetData }) => {
        const { sourceChain } = rulesetData.cow;

        (await getRulesetPolicy(tx, session, ruleset)).canUpdateEntity();

        const mechanic = rulesetData.mechanicsById.get(mechanicId);
        const isOwned = mechanic && mechanic.rulesetId === rulesetId;
        const isInherited = mechanic && sourceChain.includes(mechanic.rulesetId);
        if (!mechanic || (!isOwned && !isInherited)) {
          throw new NotFoundError("Mechanic not found in this ruleset");
        }

        let targetId = mechanic.id;
        const expectedUpdatedAt = isOwned ? body.updatedAt : undefined;
        if (isInherited) {
          const cowResult = await cowEntity(tx, "mechanics", mechanic.id, rulesetId, sourceChain);
          targetId = cowResult.id as string;
        }

        const { updatedAt: _u, ...mechanicData } = body;
        const rows = await Mechanics.update(tx, mechanicData, { id: targetId, expectedUpdatedAt });
        if (expectedUpdatedAt && rows.length === 0) {
          throw new ConflictError(STALE_ENTITY_MESSAGE);
        }
        const updatedMechanic = rows[0];

        await createActivityWithNotifications(tx, {
          userId: session.userId,
          targetId,
          targetTable: getTableName(mechanicsInRules),
          type: "updateMechanic",
          data: { entityName: body.name, changedFields: getChangedFields(mechanic as Record<string, unknown>, body as Record<string, unknown>) },
        });

        return updatedMechanic;
      });
    });
    invalidateRuleset(rulesetId);
    return result;
  },

  async deleteRulesetMechanic(session: Session, rulesetId: string, mechanicId: string) {
    const result = await withTransaction(async (tx) => {
      return await withRulesetScope(tx, rulesetId, async ({ ruleset, rulesetData }) => {
        const { sourceChain } = rulesetData.cow;

        // Mechanics have no character-level pick table, so no in-use check.
        (await getRulesetPolicy(tx, session, ruleset)).canDeleteEntity();

        const mechanic = rulesetData.mechanicsById.get(mechanicId);
        const isOwned = mechanic && mechanic.rulesetId === rulesetId;
        const isInherited = mechanic && sourceChain.includes(mechanic.rulesetId);
        if (!mechanic || (!isOwned && !isInherited)) {
          throw new NotFoundError("Mechanic not found in this ruleset");
        }

        let targetId = mechanic.id;
        if (isInherited) {
          const cowResult = await cowEntity(tx, "mechanics", mechanic.id, rulesetId, sourceChain);
          targetId = cowResult.id as string;
        }

        const rows = await Mechanics.delete(tx, { id: targetId });
        const deletedMechanic = rows[0];

        await createActivityWithNotifications(tx, {
          userId: session.userId,
          targetId,
          targetTable: getTableName(mechanicsInRules),
          type: "deleteMechanic",
          data: { rulesetId, entityName: mechanic.name },
        });

        return deletedMechanic;
      });
    });
    invalidateRuleset(rulesetId);
    return result;
  },
} as const;

class MechanicsService extends BaseService<typeof MechanicsMethods> {
  static initialize() {
    return new MechanicsService(MechanicsMethods);
  }
}

export default MechanicsService;
