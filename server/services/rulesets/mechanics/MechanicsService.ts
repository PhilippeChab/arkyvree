import { getTableName } from "drizzle-orm";

import { mechanicsInRules } from "@/drizzle/schema.ts";
import { Engine } from "@/engine/index.ts";
import { RulesetCache, withRulesetScope } from "@/server/cache/rulesetCache/index.ts";
import { RulesetEdit } from "@/server/cow/index.ts";
import { db, withTransaction } from "@/server/database/index.ts";
import { ConflictError, STALE_ENTITY_MESSAGE } from "@/server/errors/index.ts";
import { Mechanics } from "@/server/repositories/index.ts";
import { createActivityWithNotifications, getChangedFields } from "@/server/services/activities/index.ts";
import { RulesetsPolicy } from "@/server/services/policies/index.ts";
import type { Session } from "@/shared/relations.ts";

class MechanicsService {
  async createMechanic(
    session: Session,
    rulesetId: string,
    body: {
      description?: string | null;
      name: string;
    },
  ) {
    const result = await withTransaction(
      async (tx) =>
        await withRulesetScope(tx, rulesetId, async (scope) => {
          const { ruleset, rulesetData } = scope;
          (await RulesetsPolicy.for(tx, session, ruleset)).canUpdateEntity();

          const edit = new RulesetEdit(ruleset, rulesetData.cow);
          const { tombstoneAncestorId } = await edit.assertNameAvailable(tx, "mechanics", body.name);

          const rows = await Mechanics.create(tx, { ...body, rulesetId });
          const mechanic = rows[0];

          if (tombstoneAncestorId) await edit.repointTombstone(tx, "mechanics", tombstoneAncestorId, mechanic.id);

          await createActivityWithNotifications(tx, {
            userId: session.userId,
            targetId: mechanic.id,
            targetTable: getTableName(mechanicsInRules),
            type: "createMechanic",
            data: { entityName: mechanic.name },
          });

          return mechanic;
        }),
    );
    RulesetCache.invalidate(rulesetId);
    return result;
  }

  async deleteMechanic(session: Session, rulesetId: string, mechanicId: string) {
    const result = await withTransaction(
      async (tx) =>
        await withRulesetScope(tx, rulesetId, async (scope) => {
          const { ruleset, rulesetData } = scope;

          // Mechanics have no character-level pick table, so no in-use check.
          (await RulesetsPolicy.for(tx, session, ruleset)).canDeleteEntity();

          const mechanic = Engine.for(scope).entity("mechanics", mechanicId).get();

          const edit = new RulesetEdit(ruleset, rulesetData.cow);
          const targetId = await edit.cowToDelete(tx, "mechanics", mechanic);

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
        }),
    );
    RulesetCache.invalidate(rulesetId);
    return result;
  }

  async getMechanic(rulesetId: string, mechanicId: string) {
    return await withRulesetScope(db, rulesetId, async (scope) => {
      const mechanic = Engine.for(scope).entity("mechanics", mechanicId).get();
      return mechanic;
    });
  }

  async getMechanics(
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
      const { rulesetData } = scope;
      const { sourceChain } = rulesetData.cow;
      return await Mechanics.findPage(db, { rulesetId, ancestorRulesetIds: sourceChain, ...where }, pagination);
    });
  }

  async updateMechanic(
    session: Session,
    rulesetId: string,
    mechanicId: string,
    body: {
      description?: string | null;
      name: string;
      updatedAt?: string;
    },
  ) {
    const result = await withTransaction(
      async (tx) =>
        await withRulesetScope(tx, rulesetId, async (scope) => {
          const { ruleset, rulesetData } = scope;

          (await RulesetsPolicy.for(tx, session, ruleset)).canUpdateEntity();

          const mechanic = Engine.for(scope).entity("mechanics", mechanicId).get();

          const edit = new RulesetEdit(ruleset, rulesetData.cow);
          const { id: targetId, copied } = await edit.cowToEdit(tx, "mechanics", mechanic);
          const expectedUpdatedAt = copied ? undefined : body.updatedAt;

          const { updatedAt: _u, ...mechanicData } = body;
          const rows = await Mechanics.update(tx, mechanicData, { id: targetId, expectedUpdatedAt });
          if (expectedUpdatedAt && rows.length === 0) throw new ConflictError(STALE_ENTITY_MESSAGE);

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
        }),
    );
    RulesetCache.invalidate(rulesetId);
    return result;
  }
}

export default new MechanicsService();
