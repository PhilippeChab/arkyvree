import { getTableName } from "drizzle-orm";

import { racesInRules } from "@/drizzle/schema.ts";
import { findScopedEntity, RulesetCache, withRulesetScope } from "@/server/cache/rulesetCache/index.ts";
import { hasCharacterPicks, RulesetEdit } from "@/server/cow/index.ts";
import { db, withTransaction } from "@/server/database/index.ts";
import { ConflictError, STALE_ENTITY_MESSAGE } from "@/server/errors/index.ts";
import { Races } from "@/server/repositories/index.ts";
import { createActivityWithNotifications, getChangedFields } from "@/server/services/activities/index.ts";
import { RulesetsPolicy } from "@/server/services/policies/index.ts";
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
        await withRulesetScope(tx, rulesetId, async ({ ruleset, rulesetData }) => {
          (await RulesetsPolicy.for(tx, session, ruleset)).canUpdateEntity();

          const edit = new RulesetEdit(ruleset, rulesetData.cow);
          const { tombstoneAncestorId } = await edit.assertNameAvailable(tx, "races", body.name);

          const rows = await Races.create(tx, {
            ...body,
            rulesetId,
            size: body.size || "Medium",
            baseSpeed: body.baseSpeed || 30,
          });
          const race = rows[0];

          if (tombstoneAncestorId) await edit.repointTombstone(tx, "races", tombstoneAncestorId, race.id);

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
    RulesetCache.invalidate(rulesetId);
    return result;
  }

  async deleteRace(session: Session, rulesetId: string, raceId: string) {
    const result = await withTransaction(
      async (tx) =>
        await withRulesetScope(tx, rulesetId, async ({ ruleset, rulesetData }) => {
          const { sourceChain } = rulesetData.cow;

          const inUse = await hasCharacterPicks(tx, "races", raceId, rulesetId);
          (await RulesetsPolicy.for(tx, session, ruleset)).canDeleteEntity({ inUse });

          const race = findScopedEntity(rulesetData.racesById, raceId, rulesetId, sourceChain, "Race");

          const edit = new RulesetEdit(ruleset, rulesetData.cow);
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
    RulesetCache.invalidate(rulesetId);
    return result;
  }

  async getRace(rulesetId: string, raceId: string) {
    return await withRulesetScope(db, rulesetId, async ({ rulesetData }) => {
      const { sourceChain } = rulesetData.cow;
      const race = findScopedEntity(rulesetData.racesById, raceId, rulesetId, sourceChain, "Race");
      return {
        ...race,
        modifiers: rulesetData.modifiersBySource.get(race.id) ?? [],
        properties: rulesetData.propertiesByEntity.get(race.id) ?? [],
        requirements: rulesetData.requirementsByEntity.get(race.id) ?? [],
      };
    });
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
    return await withRulesetScope(db, rulesetId, async ({ rulesetData }) => {
      const { sourceChain } = rulesetData.cow;
      return await Races.findPage(db, { rulesetId, ancestorRulesetIds: sourceChain, ...where }, pagination);
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
        await withRulesetScope(tx, rulesetId, async ({ ruleset, rulesetData }) => {
          const { sourceChain } = rulesetData.cow;

          (await RulesetsPolicy.for(tx, session, ruleset)).canUpdateEntity();

          const race = findScopedEntity(rulesetData.racesById, raceId, rulesetId, sourceChain, "Race");

          const edit = new RulesetEdit(ruleset, rulesetData.cow);
          const { id: targetId, copied } = await edit.cowToEdit(tx, "races", race);
          const expectedUpdatedAt = copied ? undefined : body.updatedAt;

          const { updatedAt: _u, ...raceData } = body;
          const rows = await Races.update(tx, raceData, { id: targetId, expectedUpdatedAt });
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
    RulesetCache.invalidate(rulesetId);
    return result;
  }
}

export default new RacesService();
