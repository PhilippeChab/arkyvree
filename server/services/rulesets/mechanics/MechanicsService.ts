import { getTableName } from "drizzle-orm";

import { mechanicsInRules } from "@/drizzle/schema.ts";
import { invalidateRuleset } from "@/server/cache/rulesetCache.ts";
import { db, withTransaction } from "@/server/database/index.ts";
import { ConflictError, STALE_ENTITY_MESSAGE } from "@/server/errors/index.ts";
import { Mechanics } from "@/server/repositories/index.ts";
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

class MechanicsService {
  async getRulesetMechanics(
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
      return await Mechanics.findManyByRulesetId(
        db,
        { rulesetId, ancestorRulesetIds: sourceChain, ...where },
        pagination,
      );
    });
  }

  async getRulesetMechanic(rulesetId: string, mechanicId: string) {
    return await withRulesetScope(db, rulesetId, async ({ rulesetData }) => {
      const { sourceChain } = rulesetData.cow;
      const mechanic = findScopedEntity(rulesetData.mechanicsById, mechanicId, rulesetId, sourceChain, "Mechanic");
      return mechanic;
    });
  }

  async createRulesetMechanic(
    session: Session,
    rulesetId: string,
    body: {
      name: string;
      description?: string | null;
    },
  ) {
    const result = await withTransaction(async (tx) => {
      return await withRulesetScope(tx, rulesetId, async ({ ruleset, rulesetData }) => {
        (await RulesetsPolicy.for(tx, session, ruleset)).canUpdateEntity();

        const { tombstoneAncestorId } = await assertEntityNameAvailable(
          tx,
          rulesetId,
          rulesetData.cow,
          "mechanics",
          body.name,
        );

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
  }

  async updateRulesetMechanic(
    session: Session,
    rulesetId: string,
    mechanicId: string,
    body: {
      name: string;
      description?: string | null;
      updatedAt?: string;
    },
  ) {
    const result = await withTransaction(async (tx) => {
      return await withRulesetScope(tx, rulesetId, async ({ ruleset, rulesetData }) => {
        const { sourceChain } = rulesetData.cow;

        (await RulesetsPolicy.for(tx, session, ruleset)).canUpdateEntity();

        const mechanic = findScopedEntity(rulesetData.mechanicsById, mechanicId, rulesetId, sourceChain, "Mechanic");

        const { id: targetId, copied } = await entityToEdit(tx, ruleset, sourceChain, "mechanics", mechanic);
        const expectedUpdatedAt = copied ? undefined : body.updatedAt;

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
          data: {
            entityName: body.name,
            changedFields: getChangedFields(mechanic, body),
          },
        });

        return updatedMechanic;
      });
    });
    invalidateRuleset(rulesetId);
    return result;
  }

  async deleteRulesetMechanic(session: Session, rulesetId: string, mechanicId: string) {
    const result = await withTransaction(async (tx) => {
      return await withRulesetScope(tx, rulesetId, async ({ ruleset, rulesetData }) => {
        const { sourceChain } = rulesetData.cow;

        // Mechanics have no character-level pick table, so no in-use check.
        (await RulesetsPolicy.for(tx, session, ruleset)).canDeleteEntity();

        const mechanic = findScopedEntity(rulesetData.mechanicsById, mechanicId, rulesetId, sourceChain, "Mechanic");

        const targetId = await entityToDelete(tx, ruleset, sourceChain, "mechanics", mechanic);

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
  }
}

export default new MechanicsService();
