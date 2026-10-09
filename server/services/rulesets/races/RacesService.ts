import { getTableName } from "drizzle-orm";

import { racesInRules } from "@/drizzle/schema.ts";
import { Engine } from "@/engine/index.ts";
import { EntityEdit, EntityNames, RulesetViews, withRulesetScope } from "@/server/cow/index.ts";
import { db, withTransaction } from "@/server/database/index.ts";
import { ConflictError, STALE_ENTITY_MESSAGE } from "@/server/errors/index.ts";
import { Races } from "@/server/repositories/index.ts";
import { createActivityWithNotifications, getChangedFields } from "@/server/services/activities/index.ts";
import { RulesetsPolicy } from "@/server/services/policies/index.ts";
import { hasCharacterPicks } from "@/server/services/rulesets/characterPicks.ts";
import type { SizeType } from "@/shared/enums.ts";
import type { Session } from "@/shared/relations.ts";

class RacesService {
  async createRace(
    session: Session,
    rulesetId: string,
    body: {
      baseSpeed: number;
      description?: string | null;
      name: string;
      size: SizeType;
    },
  ) {
    const result = await withTransaction(
      async (tx) =>
        await withRulesetScope(tx, rulesetId, async (scope) => {
          const { ruleset, rulesetData } = scope;
          (await RulesetsPolicy.for(tx, session, ruleset)).canUpdateEntity();

          const plan = Engine.for(scope).entities("races").planCreate(body);
          const names = new EntityNames(ruleset, rulesetData.cow);
          const { tombstoneAncestorId } = await names.assertNameAvailable(tx, "races", plan.name);

          const rows = await Races.create(tx, { ...plan.columns, rulesetId });
          const race = rows[0];

          if (tombstoneAncestorId) await names.repointTombstone(tx, "races", tombstoneAncestorId, race.id);

          await createActivityWithNotifications(tx, {
            userId: session.userId,
            targetId: race.id,
            targetTable: getTableName(racesInRules),
            type: "createRace",
            data: { entityName: race.name },
          });

          return race;
        }),
    );
    RulesetViews.invalidate(rulesetId);
    return result;
  }

  async deleteRace(session: Session, rulesetId: string, raceId: string) {
    const result = await withTransaction(
      async (tx) =>
        await withRulesetScope(tx, rulesetId, async (scope) => {
          const { ruleset } = scope;

          const inUse = await hasCharacterPicks(tx, "races", scope.rulesetData.cow.getEquivalentIds(raceId), rulesetId);
          (await RulesetsPolicy.for(tx, session, ruleset)).canDeleteEntity({ inUse });

          const { entity: race } = Engine.for(scope).entities("races").planDelete(raceId);

          const edit = new EntityEdit(ruleset);
          const targetId = await edit.cowToDelete(tx, "races", race);

          // The database deletes its customizations with it.
          const rows = await Races.delete(tx, { id: targetId });
          const deletedRace = rows[0];
          await createActivityWithNotifications(tx, {
            userId: session.userId,
            targetId,
            targetTable: getTableName(racesInRules),
            type: "deleteRace",
            data: { rulesetId, entityName: race.name },
          });

          return deletedRace;
        }),
    );
    RulesetViews.invalidate(rulesetId);
    return result;
  }

  async getRace(rulesetId: string, raceId: string) {
    return await withRulesetScope(db, rulesetId, async (scope) => Engine.for(scope).entities("races").describe(raceId));
  }

  async getRaces(
    rulesetId: string,
    where: {
      childOnly?: boolean;
      kind?: string;
      orderBy?: "name" | "createdAt" | "updatedAt";
      orderDir?: "asc" | "desc";
      search?: string;
    },
    pagination: { limit: number; page: number },
  ) {
    return await withRulesetScope(db, rulesetId, async (scope) => {
      const result = await Races.findPage(
        db,
        { rulesetId, ...scope.rulesetData.cow.listFilters, ...where },
        pagination,
      );
      return { ...result, items: Engine.for(scope).entities("races").describePage(result.items) };
    });
  }

  async updateRace(
    session: Session,
    rulesetId: string,
    raceId: string,
    body: {
      baseSpeed: number;
      description?: string | null;
      name: string;
      size: SizeType;
      updatedAt?: string;
    },
  ) {
    const result = await withTransaction(
      async (tx) =>
        await withRulesetScope(tx, rulesetId, async (scope) => {
          const { ruleset } = scope;

          (await RulesetsPolicy.for(tx, session, ruleset)).canUpdateEntity();

          const { columns, entity: race } = Engine.for(scope).entities("races").planEdit(raceId, body);

          const edit = new EntityEdit(ruleset);
          const { id: targetId, copied } = await edit.cowToEdit(tx, "races", race);
          const expectedUpdatedAt = copied ? undefined : body.updatedAt;

          const rows = await Races.update(tx, columns, { id: targetId, expectedUpdatedAt });
          if (expectedUpdatedAt && rows.length === 0) throw new ConflictError(STALE_ENTITY_MESSAGE);

          const updatedRace = rows[0];

          await createActivityWithNotifications(tx, {
            userId: session.userId,
            targetId,
            targetTable: getTableName(racesInRules),
            type: "updateRace",
            data: {
              entityName: body.name,
              changedFields: getChangedFields(race, body),
            },
          });

          return updatedRace;
        }),
    );
    RulesetViews.invalidate(rulesetId);
    return result;
  }
}

export default new RacesService();
