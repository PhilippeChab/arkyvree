import { aptitudesInRules } from "@/drizzle/schema.ts";
import { db, withTransaction } from "@/server/database/index.ts";
import { ConflictError, NotFoundError, STALE_ENTITY_MESSAGE } from "@/server/errors/index.ts";
import { Aptitudes } from "@/server/repositories/index.ts";
import { invalidateRuleset } from "@/server/cache/rulesetCache.ts";
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

export const AptitudesMethods = {
  async getRulesetAptitudes(
    rulesetId: string,
    where: { childOnly?: boolean; scope?: "feats" | "spells"; search?: string; orderBy?: "name" | "createdAt" | "updatedAt"; orderDir?: "asc" | "desc" },
    pagination: { limit: number; page: number },
  ) {
    return await withRulesetScope(db, rulesetId, async ({ rulesetData }) => {
      const { sourceChain, idResolveMap } = rulesetData.cow;
      // Exclude loser aptitude IDs (and any other id-canonicalize keys) at the
      // DB level so pagination counts are accurate. idResolveMap is the right
      // source: includes aptitude name-grouping losers, sibling losers, and
      // overridden source IDs — all things that shouldn't appear in the list.
      const excludeIds = sourceChain.length > 0 && !where.childOnly
        ? [...idResolveMap.keys()]
        : undefined;
      return await Aptitudes.findManyByRulesetId(db, { rulesetId, ancestorRulesetIds: sourceChain, excludeIds, ...where }, pagination);
    });
  },

  async getRulesetAptitude(rulesetId: string, aptitudeId: string) {
    return await withRulesetScope(db, rulesetId, async ({ rulesetData }) => {
      const { sourceChain } = rulesetData.cow;
      const aptitude = rulesetData.aptitudesById.get(aptitudeId);
      if (!aptitude || (aptitude.rulesetId !== rulesetId && !sourceChain.includes(aptitude.rulesetId))) {
        throw new NotFoundError("Aptitude not found in this ruleset");
      }
      return aptitude;
    });
  },

  async createRulesetAptitude(session: Session, rulesetId: string, body: {
    name: string;
    description?: string | null;
  }) {
    const result = await withTransaction(async (tx) => {
      return await withRulesetScope(tx, rulesetId, async ({ ruleset, rulesetData }) => {
        const { sourceChain } = rulesetData.cow;

        (await getRulesetPolicy(tx, session, ruleset)).canUpdateEntity();

        const { tombstoneAncestorId } = await assertEntityNameAvailable(tx, rulesetId, sourceChain, "aptitudes", body.name);

        const rows = await Aptitudes.create(tx, {
          ...body,
          rulesetId,
        });
        const aptitude = rows[0];

        if (tombstoneAncestorId) {
          await repointTombstoneSnapshot(tx, rulesetId, "aptitudes", tombstoneAncestorId, aptitude.id);
        }

        await createActivityWithNotifications(tx, {
          userId: session.userId,
          targetId: aptitude.id,
          targetTable: getTableName(aptitudesInRules),
          type: "createAptitude",
          data: { entityName: aptitude.name },
        });

        return aptitude;
      });
    });
    invalidateRuleset(rulesetId);
    return result;
  },

  async updateRulesetAptitude(session: Session, rulesetId: string, aptitudeId: string, body: {
    name: string;
    description?: string | null;
    updatedAt?: string;
  }) {
    const result = await withTransaction(async (tx) => {
      return await withRulesetScope(tx, rulesetId, async ({ ruleset, rulesetData }) => {
        const { sourceChain } = rulesetData.cow;

        (await getRulesetPolicy(tx, session, ruleset)).canUpdateEntity();

        const aptitude = rulesetData.aptitudesById.get(aptitudeId);
        const isOwned = aptitude && aptitude.rulesetId === rulesetId;
        const isInherited = aptitude && sourceChain.includes(aptitude.rulesetId);
        if (!aptitude || (!isOwned && !isInherited)) {
          throw new NotFoundError("Aptitude not found in this ruleset");
        }

        let targetId = aptitude.id;
        const expectedUpdatedAt = isOwned ? body.updatedAt : undefined;
        if (isInherited) {
          const cowResult = await cowEntity(tx, "aptitudes", aptitude.id, rulesetId, sourceChain);
          targetId = cowResult.id as string;
        }

        const { updatedAt: _u, ...aptitudeData } = body;
        const rows = await Aptitudes.update(tx, aptitudeData, { id: targetId, expectedUpdatedAt });
        if (expectedUpdatedAt && rows.length === 0) {
          throw new ConflictError(STALE_ENTITY_MESSAGE);
        }
        const updatedAptitude = rows[0];

        await createActivityWithNotifications(tx, {
          userId: session.userId,
          targetId,
          targetTable: getTableName(aptitudesInRules),
          type: "updateAptitude",
          data: { entityName: body.name, changedFields: getChangedFields(aptitude as Record<string, unknown>, body as Record<string, unknown>) },
        });

        return updatedAptitude;
      });
    });
    invalidateRuleset(rulesetId);
    return result;
  },

  async deleteRulesetAptitude(session: Session, rulesetId: string, aptitudeId: string) {
    const result = await withTransaction(async (tx) => {
      return await withRulesetScope(tx, rulesetId, async ({ ruleset, rulesetData }) => {
        const { sourceChain } = rulesetData.cow;

        const inUse = await entityHasCharacterPicks(tx, "aptitudes", aptitudeId, rulesetId);
        (await getRulesetPolicy(tx, session, ruleset)).canDeleteEntity({ inUse });

        const aptitude = rulesetData.aptitudesById.get(aptitudeId);
        const isOwned = aptitude && aptitude.rulesetId === rulesetId;
        const isInherited = aptitude && sourceChain.includes(aptitude.rulesetId);
        if (!aptitude || (!isOwned && !isInherited)) {
          throw new NotFoundError("Aptitude not found in this ruleset");
        }

        let targetId = aptitude.id;
        if (isInherited) {
          const cowResult = await cowEntity(tx, "aptitudes", aptitude.id, rulesetId, sourceChain);
          targetId = cowResult.id as string;
        }

        // Customizations are polymorphic FKs — Postgres can't cascade these.
        await deleteModifiersWithCascade(tx, { sourceIds: [targetId], sourceType: "aptitudes" });
        await deletePropertiesWithCascade(tx, { entityIds: [targetId], entityType: "aptitudes" });
        await deleteRequirementsWithCascade(tx, { entityIds: [targetId], entityType: "aptitudes" });

        // FK CASCADE on feats_aptitudes / powers_aptitudes / klass_level_feats /
        // klass_level_powers wipes the join rows pointing at this aptitude.
        const rows = await Aptitudes.delete(tx, { id: targetId });
        const deletedAptitude = rows[0];

        await createActivityWithNotifications(tx, {
          userId: session.userId,
          targetId,
          targetTable: getTableName(aptitudesInRules),
          type: "deleteAptitude",
          data: { rulesetId, entityName: aptitude.name },
        });

        return deletedAptitude;
      });
    });
    invalidateRuleset(rulesetId);
    return result;
  },
} as const;

class AptitudesService extends BaseService<typeof AptitudesMethods> {
  static initialize() {
    return new AptitudesService(AptitudesMethods);
  }
}

export default AptitudesService;
