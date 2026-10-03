import { getTableName } from "drizzle-orm";

import { racesInRules } from "@/drizzle/schema.ts";
import { invalidateRuleset } from "@/server/cache/rulesetCache.ts";
import { db, withTransaction } from "@/server/database/index.ts";
import { ConflictError, STALE_ENTITY_MESSAGE } from "@/server/errors/index.ts";
import { Races } from "@/server/repositories/index.ts";
import { createActivityWithNotifications, getChangedFields } from "@/server/services/activities/index.ts";
import { RulesetsPolicy } from "@/server/services/policies/index.ts";
import {
  assertEntityNameAvailable,
  entityHasCharacterPicks,
  entityToDelete,
  entityToEdit,
  findScopedEntity,
  repointTombstoneSnapshot,
  withRulesetScope,
} from "@/server/services/rulesets/cow/index.ts";
import type { SizeType } from "@/shared/enums.ts";
import type { Session } from "@/shared/relations.ts";

class RacesService {
  async getRulesetRaces(
    rulesetId: string,
    where: {
      childOnly?: boolean;
      kind?: string;
      search?: string;
      orderBy?: "name" | "createdAt" | "updatedAt";
      orderDir?: "asc" | "desc";
    },
    pagination: { limit: number; page: number },
  ) {
    return await withRulesetScope(db, rulesetId, async ({ rulesetData }) => {
      const { sourceChain } = rulesetData.cow;
      return await Races.findManyByRulesetId(db, { rulesetId, ancestorRulesetIds: sourceChain, ...where }, pagination);
    });
  }

  async getRulesetRace(rulesetId: string, raceId: string) {
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

  async createRulesetRace(
    session: Session,
    rulesetId: string,
    body: {
      name: string;
      description?: string | null;
      size: SizeType;
      baseSpeed: number;
    },
  ) {
    const result = await withTransaction(async (tx) => {
      return await withRulesetScope(tx, rulesetId, async ({ ruleset, rulesetData }) => {
        (await RulesetsPolicy.for(tx, session, ruleset)).canUpdateEntity();

        const { tombstoneAncestorId } = await assertEntityNameAvailable(
          tx,
          rulesetId,
          rulesetData.cow,
          "races",
          body.name,
        );

        const rows = await Races.create(tx, {
          ...body,
          rulesetId,
          size: body.size || "Medium",
          baseSpeed: body.baseSpeed || 30,
        });
        const race = rows[0];

        if (tombstoneAncestorId) {
          await repointTombstoneSnapshot(tx, rulesetId, "races", tombstoneAncestorId, race.id);
        }

        await createActivityWithNotifications(tx, {
          userId: session.userId,
          targetId: race.id,
          targetTable: getTableName(racesInRules),
          type: "createRace",
          data: { entityName: race.name },
        });

        return race;
      });
    });
    invalidateRuleset(rulesetId);
    return result;
  }

  async updateRulesetRace(
    session: Session,
    rulesetId: string,
    raceId: string,
    body: {
      name: string;
      description?: string | null;
      size: SizeType;
      baseSpeed: number;
      updatedAt?: string;
    },
  ) {
    const result = await withTransaction(async (tx) => {
      return await withRulesetScope(tx, rulesetId, async ({ ruleset, rulesetData }) => {
        const { sourceChain } = rulesetData.cow;

        (await RulesetsPolicy.for(tx, session, ruleset)).canUpdateEntity();

        const race = findScopedEntity(rulesetData.racesById, raceId, rulesetId, sourceChain, "Race");

        const { id: targetId, copied } = await entityToEdit(tx, ruleset, sourceChain, "races", race);
        const expectedUpdatedAt = copied ? undefined : body.updatedAt;

        const { updatedAt: _u, ...raceData } = body;
        const rows = await Races.update(tx, raceData, { id: targetId, expectedUpdatedAt });
        if (expectedUpdatedAt && rows.length === 0) {
          throw new ConflictError(STALE_ENTITY_MESSAGE);
        }
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
      });
    });
    invalidateRuleset(rulesetId);
    return result;
  }

  async deleteRulesetRace(session: Session, rulesetId: string, raceId: string) {
    const result = await withTransaction(async (tx) => {
      return await withRulesetScope(tx, rulesetId, async ({ ruleset, rulesetData }) => {
        const { sourceChain } = rulesetData.cow;

        const inUse = await entityHasCharacterPicks(tx, "races", raceId, rulesetId);
        (await RulesetsPolicy.for(tx, session, ruleset)).canDeleteEntity({ inUse });

        const race = findScopedEntity(rulesetData.racesById, raceId, rulesetId, sourceChain, "Race");

        const targetId = await entityToDelete(tx, ruleset, sourceChain, "races", race);

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
      });
    });
    invalidateRuleset(rulesetId);
    return result;
  }
}

export default new RacesService();
