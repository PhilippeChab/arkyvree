import { getTableName } from "drizzle-orm";

import { powersInRules } from "@/drizzle/schema.ts";
import { Engine, type PowersEngine } from "@/engine/index.ts";
import { RulesetCache, withRulesetScope } from "@/server/cache/rulesetCache/index.ts";
import { hasCharacterPicks, RulesetEdit } from "@/server/cow/index.ts";
import { db, withTransaction } from "@/server/database/index.ts";
import { ConflictError, STALE_ENTITY_MESSAGE } from "@/server/errors/index.ts";
import { Powers, PowersAptitudes } from "@/server/repositories/index.ts";
import { createActivityWithNotifications, getChangedFields } from "@/server/services/activities/index.ts";
import { RulesetsPolicy } from "@/server/services/policies/index.ts";
import { writeEntityWrites } from "@/server/services/rulesets/entityWrites.ts";
import type { Session } from "@/shared/relations.ts";

/** A power's body: its row's columns, its aptitude links, and its fields (`planPowerCreate`). */
type PowerBody = Parameters<PowersEngine["planCreate"]>[0] & { updatedAt?: string };

class PowersService {
  async createPower(session: Session, rulesetId: string, body: PowerBody) {
    const result = await withTransaction(
      async (tx) =>
        await withRulesetScope(tx, rulesetId, async (scope) => {
          const { ruleset, rulesetData } = scope;
          (await RulesetsPolicy.for(tx, session, ruleset)).canUpdateEntity();

          const edit = new RulesetEdit(ruleset, rulesetData.cow);
          const { tombstoneAncestorId } = await edit.assertNameAvailable(tx, "powers", body.name);

          const plan = Engine.for(scope).powers().planCreate(body);
          const rows = await Powers.create(tx, { ...plan.columns, rulesetId });
          const power = rows[0];

          if (tombstoneAncestorId) await edit.repointTombstone(tx, "powers", tombstoneAncestorId, power.id);

          await PowersAptitudes.createMany(
            tx,
            plan.aptitudes.map((aptitude) => ({ powerId: power.id, ...aptitude })),
          );
          await writeEntityWrites(tx, scope, { entityId: power.id, entityType: "powers" }, plan.writes);

          await createActivityWithNotifications(tx, {
            userId: session.userId,
            targetId: power.id,
            targetTable: getTableName(powersInRules),
            type: "createPower",
            data: { baseRules: ruleset.baseRules, entityName: power.name },
          });

          return power;
        }),
    );
    RulesetCache.invalidate(rulesetId);
    return result;
  }

  async deletePower(session: Session, rulesetId: string, powerId: string) {
    const result = await withTransaction(
      async (tx) =>
        await withRulesetScope(tx, rulesetId, async (scope) => {
          const { ruleset, rulesetData } = scope;

          const inUse = await hasCharacterPicks(tx, "powers", powerId, rulesetId);
          (await RulesetsPolicy.for(tx, session, ruleset)).canDeleteEntity({ inUse });

          const power = Engine.for(scope).entity("powers", powerId).get();

          const edit = new RulesetEdit(ruleset, rulesetData.cow);
          const targetId = await edit.cowToDelete(tx, "powers", power);

          // FK CASCADE on powers_aptitudes.power_id and klass_level_powers.power_id
          // wipes those join rows when the power row is deleted.
          // The database deletes its customizations with it.
          const rows = await Powers.delete(tx, { id: targetId });
          const deletedPower = rows[0];

          await createActivityWithNotifications(tx, {
            userId: session.userId,
            targetId,
            targetTable: getTableName(powersInRules),
            type: "deletePower",
            data: { baseRules: ruleset.baseRules, rulesetId, entityName: power.name },
          });

          return deletedPower;
        }),
    );
    RulesetCache.invalidate(rulesetId);
    return result;
  }

  async getPower(rulesetId: string, powerId: string) {
    return await withRulesetScope(db, rulesetId, async (scope) =>
      Engine.for(scope).entity("powers", powerId).describe(),
    );
  }

  /** A page of the ruleset's powers, as its composed view has them: all of them, or a list's (at a level). */
  async getPowers(
    rulesetId: string,
    where: {
      aptitudeId?: string;
      childOnly?: boolean;
      level?: number;
      orderBy?: "name" | "createdAt" | "updatedAt";
      orderDir?: "asc" | "desc";
      search?: string;
    },
    pagination: { limit: number; page: number },
  ) {
    return await withRulesetScope(db, rulesetId, async (scope) => {
      const { aptitudeId, level, ...filters } = where;
      const list = Engine.for(scope).powers().openList({ aptitudeId, childOnly: where.childOnly, level });
      const result = await Powers.findPage(
        db,
        { rulesetId, ancestorRulesetIds: scope.rulesetData.cow.sourceChain, ...filters, ...list.filters },
        pagination,
      );
      return { ...result, items: list.describe(result.items) };
    });
  }

  async updatePower(session: Session, rulesetId: string, powerId: string, body: PowerBody) {
    const result = await withTransaction(
      async (tx) =>
        await withRulesetScope(tx, rulesetId, async (scope) => {
          const { ruleset, rulesetData } = scope;

          (await RulesetsPolicy.for(tx, session, ruleset)).canUpdateEntity();

          const { aptitudes, columns, power, writes } = Engine.for(scope).powers().planEdit(powerId, body);

          const edit = new RulesetEdit(ruleset, rulesetData.cow);
          const { id: targetId, copied } = await edit.cowToEdit(tx, "powers", power);
          const expectedUpdatedAt = copied ? undefined : body.updatedAt;

          const rows = await Powers.update(tx, columns, { id: targetId, expectedUpdatedAt });
          if (expectedUpdatedAt && rows.length === 0) throw new ConflictError(STALE_ENTITY_MESSAGE);

          const updatedPower = rows[0];

          if (aptitudes !== undefined) {
            await PowersAptitudes.delete(tx, { powerId: targetId });
            await PowersAptitudes.createMany(
              tx,
              aptitudes.map((aptitude) => ({ powerId: targetId, ...aptitude })),
            );
          }
          await writeEntityWrites(tx, scope, { entityId: targetId, entityType: "powers" }, writes);

          await createActivityWithNotifications(tx, {
            userId: session.userId,
            targetId,
            targetTable: getTableName(powersInRules),
            type: "updatePower",
            data: {
              baseRules: ruleset.baseRules,
              entityName: body.name,
              changedFields: getChangedFields(power, body),
            },
          });

          return updatedPower;
        }),
    );
    RulesetCache.invalidate(rulesetId);
    return result;
  }
}

export default new PowersService();
