import { racesInRules } from "@/drizzle/schema.ts";
import { invalidateRuleset } from "@/server/cache/rulesetCache.ts";
import { db, withTransaction } from "@/server/database/index.ts";
import { ConflictError, NotFoundError, STALE_ENTITY_MESSAGE } from "@/server/errors/index.ts";
import { Races } from "@/server/repositories/index.ts";
import BaseService from "@/server/services/BaseService.ts";
import { createActivityWithNotifications, getChangedFields } from "@/server/services/activityNotifications.ts";
import {
  assertEntityNameAvailable,
  cowEntity,
  deleteModifiersWithCascade,
  deletePropertiesWithCascade,
  deleteRequirementsWithCascade,
  entityHasCharacterPicks,
  repointTombstoneSnapshot,
  withRulesetScope,
} from "@/server/services/rulesets/cow.ts";
import { getRulesetPolicy } from "@/server/services/rulesets/helpers.ts";
import type { Session } from "@/shared/relations.ts";
import { getTableName } from "drizzle-orm";

export const RacesMethods = {
  async getRulesetRaces(
    rulesetId: string,
    where: { childOnly?: boolean; kind?: string; search?: string; orderBy?: "name" | "createdAt" | "updatedAt"; orderDir?: "asc" | "desc" },
    pagination: { limit: number; page: number },
  ) {
    return await withRulesetScope(db, rulesetId, async ({ rulesetData }) => {
      const { sourceChain } = rulesetData.cow;
      return await Races.findManyByRulesetId(db, { rulesetId, ancestorRulesetIds: sourceChain, ...where }, pagination);
    });
  },

  async getRulesetRace(rulesetId: string, raceId: string) {
    return await withRulesetScope(db, rulesetId, async ({ rulesetData }) => {
      const { sourceChain } = rulesetData.cow;
      const race = rulesetData.racesById.get(raceId);
      if (!race || (race.rulesetId !== rulesetId && !sourceChain.includes(race.rulesetId))) {
        throw new NotFoundError("Race not found in this ruleset");
      }
      return {
        ...race,
        modifiers: rulesetData.modifiersBySource.get(race.id) ?? [],
        properties: rulesetData.propertiesByEntity.get(race.id) ?? [],
        requirements: rulesetData.requirementsByEntity.get(race.id) ?? [],
      };
    });
  },

  async createRulesetRace(session: Session, rulesetId: string, body: {
    name: string;
    description?: string | null;
    size:
      | "Fine"
      | "Diminutive"
      | "Tiny"
      | "Small"
      | "Medium"
      | "Large"
      | "Huge"
      | "Gargantuan"
      | "Colossal";
    baseSpeed: number;
  }) {
    const result = await withTransaction(async (tx) => {
      return await withRulesetScope(tx, rulesetId, async ({ ruleset, rulesetData }) => {
        const { sourceChain } = rulesetData.cow;

        (await getRulesetPolicy(tx, session, ruleset)).canUpdateEntity();

        const { tombstoneAncestorId } = await assertEntityNameAvailable(tx, rulesetId, sourceChain, "races", body.name);

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
  },

  async updateRulesetRace(session: Session, rulesetId: string, raceId: string, body: {
    name: string;
    description?: string | null;
    size:
      | "Fine"
      | "Diminutive"
      | "Tiny"
      | "Small"
      | "Medium"
      | "Large"
      | "Huge"
      | "Gargantuan"
      | "Colossal";
    baseSpeed: number;
    updatedAt?: string;
  }) {
    const result = await withTransaction(async (tx) => {
      return await withRulesetScope(tx, rulesetId, async ({ ruleset, rulesetData }) => {
        const { sourceChain } = rulesetData.cow;

        (await getRulesetPolicy(tx, session, ruleset)).canUpdateEntity();

        const race = rulesetData.racesById.get(raceId);
        const isOwned = race && race.rulesetId === rulesetId;
        const isInherited = race && sourceChain.includes(race.rulesetId);
        if (!race || (!isOwned && !isInherited)) {
          throw new NotFoundError("Race not found in this ruleset");
        }

        let targetId = race.id;
        const expectedUpdatedAt = isOwned ? body.updatedAt : undefined;
        if (isInherited) {
          const cowResult = await cowEntity(tx, "races", race.id, rulesetId, sourceChain);
          targetId = cowResult.id as string;
        }

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
          data: { entityName: body.name, changedFields: getChangedFields(race as Record<string, unknown>, body as unknown as Record<string, unknown>) },
        });

        return updatedRace;
      });
    });
    invalidateRuleset(rulesetId);
    return result;
  },

  async deleteRulesetRace(session: Session, rulesetId: string, raceId: string) {
    const result = await withTransaction(async (tx) => {
      return await withRulesetScope(tx, rulesetId, async ({ ruleset, rulesetData }) => {
        const { sourceChain } = rulesetData.cow;

        const inUse = await entityHasCharacterPicks(tx, "races", raceId, rulesetId);
        (await getRulesetPolicy(tx, session, ruleset)).canDeleteEntity({ inUse });

        const race = rulesetData.racesById.get(raceId);
        const isOwned = race && race.rulesetId === rulesetId;
        const isInherited = race && sourceChain.includes(race.rulesetId);
        if (!race || (!isOwned && !isInherited)) {
          throw new NotFoundError("Race not found in this ruleset");
        }

        let targetId = race.id;
        if (isInherited) {
          const cowResult = await cowEntity(tx, "races", race.id, rulesetId, sourceChain);
          targetId = cowResult.id as string;
        }

        // Customizations are polymorphic FKs — Postgres can't cascade these.
        await deleteRequirementsWithCascade(tx, { entityIds: [targetId], entityType: "races" });
        await deletePropertiesWithCascade(tx, { entityIds: [targetId], entityType: "races" });
        await deleteModifiersWithCascade(tx, { sourceIds: [targetId], sourceType: "races" });

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
  },
} as const;

class RacesService extends BaseService<typeof RacesMethods> {
  static initialize() {
    return new RacesService(RacesMethods);
  }
}

export default RacesService;
