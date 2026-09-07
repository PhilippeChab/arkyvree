import { featsInRules } from "@/drizzle/schema.ts";
import { db, withTransaction } from "@/server/database/index.ts";
import { BadRequestError, ConflictError, NotFoundError, STALE_ENTITY_MESSAGE } from "@/server/errors/index.ts";
import {
  Feats,
  FeatsAptitudes,
  PowersAptitudes,
} from "@/server/repositories/index.ts";
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

export const FeatsMethods = {
  async getRulesetFeats(
    rulesetId: string,
    where: { childOnly?: boolean; aptitudeId?: string; family?: string; search?: string; orderBy?: "name" | "createdAt" | "updatedAt"; orderDir?: "asc" | "desc" },
    pagination: { limit: number; page: number },
  ) {
    return await withRulesetScope(db, rulesetId, async ({ rulesetData }) => {
      const { sourceChain, siblingIds } = rulesetData.cow;
      const result = await Feats.findManyByRulesetId(db, { rulesetId, ancestorRulesetIds: sourceChain, ...where }, pagination);
      // Filter sibling losers (if any) and replace each row's aptitude links
      // with the compose-step version (sibling-merged + FK-remapped).
      if (sourceChain.length > 0 && !where.childOnly) {
        const filtered = siblingIds.size > 0 ? result.items.filter((f) => !siblingIds.has(f.id)) : result.items;
        result.items = filtered.map((f) => {
          const merged = rulesetData.featsById.get(f.id);
          return merged ? { ...f, featsAptitudesInRules: merged.featsAptitudesInRules } : f;
        });
      }
      return result;
    });
  },

  async getRulesetFeatsGrouped(
    rulesetId: string,
    where: { childOnly?: boolean; aptitudeId?: string; search?: string },
    pagination: { limit: number; page: number },
  ) {
    return await withRulesetScope(db, rulesetId, async ({ rulesetData }) => {
      const { sourceChain, overrideMap, siblingIds } = rulesetData.cow;
      // A sibling aptitude is matched by its winner's id in the composed cache,
      // but the SQL grouping query reads raw join rows — feats are still linked
      // to the pre-dedup aptitudeIds (winner + losers) in the DB. So we widen
      // the filter to cover every id that currently maps to the winner.
      let aptitudeIds: string[] | undefined;
      if (where.aptitudeId) {
        aptitudeIds = [where.aptitudeId];
        for (const [loser, winner] of overrideMap) {
          if (winner === where.aptitudeId) aptitudeIds.push(loser);
        }
      }
      const excludeIds = siblingIds.size > 0 ? [...siblingIds] : undefined;
      return await Feats.findManyGroupedByRulesetId(db, { rulesetId, ancestorRulesetIds: sourceChain, aptitudeIds, excludeIds, ...where }, pagination);
    });
  },

  async getRulesetFeat(rulesetId: string, featId: string) {
    return await withRulesetScope(db, rulesetId, async ({ rulesetData }) => {
      const { sourceChain } = rulesetData.cow;
      const feat = rulesetData.featsById.get(featId);
      if (!feat || (feat.rulesetId !== rulesetId && !sourceChain.includes(feat.rulesetId))) {
        throw new NotFoundError("Feat not found in this ruleset");
      }
      return {
        ...feat,
        modifiers: rulesetData.modifiersBySource.get(feat.id) ?? [],
        properties: rulesetData.propertiesByEntity.get(feat.id) ?? [],
        requirements: rulesetData.requirementsByEntity.get(feat.id) ?? [],
      };
    });
  },

  async createRulesetFeat(session: Session, rulesetId: string, body: {
    name: string;
    description?: string | null;
    aptitudeIds: string[];
  }) {
    const result = await withTransaction(async (tx) => {
      return await withRulesetScope(tx, rulesetId, async ({ ruleset, rulesetData }) => {
        const { sourceChain } = rulesetData.cow;

        (await getRulesetPolicy(tx, session, ruleset)).canUpdateEntity();

        const { tombstoneAncestorId } = await assertEntityNameAvailable(tx, rulesetId, sourceChain, "feats", body.name);

        if (!body.aptitudeIds || body.aptitudeIds.length === 0) {
          throw new BadRequestError("At least one aptitude must be selected for the feat");
        }

        const spellAptitudes = await PowersAptitudes.findDistinctAptitudeIds(tx, { aptitudeIds: body.aptitudeIds });
        if (spellAptitudes.length > 0) {
          throw new ConflictError("Cannot link feat to aptitude(s) already used for spells");
        }

        const rows = await Feats.create(tx, {
          name: body.name,
          description: body.description,
          rulesetId,
        });
        const feat = rows[0];

        if (tombstoneAncestorId) {
          await repointTombstoneSnapshot(tx, rulesetId, "feats", tombstoneAncestorId, feat.id);
        }

        for (const aptitudeId of body.aptitudeIds) {
          await FeatsAptitudes.create(tx, {
            featId: feat.id,
            aptitudeId,
          });
        }

        await createActivityWithNotifications(tx, {
          userId: session.userId,
          targetId: feat.id,
          targetTable: getTableName(featsInRules),
          type: "createFeat",
          data: { entityName: feat.name },
        });

        return feat;
      });
    });
    invalidateRuleset(rulesetId);
    return result;
  },

  async updateRulesetFeat(session: Session, rulesetId: string, featId: string, body: {
    name: string;
    description?: string | null;
    aptitudeIds?: string[];
    updatedAt?: string;
  }) {
    const result = await withTransaction(async (tx) => {
      return await withRulesetScope(tx, rulesetId, async ({ ruleset, rulesetData }) => {
        const { sourceChain } = rulesetData.cow;

        (await getRulesetPolicy(tx, session, ruleset)).canUpdateEntity();

        const feat = rulesetData.featsById.get(featId);
        const isOwned = feat && feat.rulesetId === rulesetId;
        const isInherited = feat && sourceChain.includes(feat.rulesetId);
        if (!feat || (!isOwned && !isInherited)) {
          throw new NotFoundError("Feat not found in this ruleset");
        }

        let targetId = feat.id;
        const expectedUpdatedAt = isOwned ? body.updatedAt : undefined;
        if (isInherited) {
          const cowResult = await cowEntity(tx, "feats", feat.id, rulesetId, sourceChain, ruleset.extensionRulesetIds);
          targetId = cowResult.id as string;
        }

        const rows = await Feats.update(tx, {
          name: body.name,
          description: body.description,
        }, { id: targetId, expectedUpdatedAt });
        if (expectedUpdatedAt && rows.length === 0) {
          throw new ConflictError(STALE_ENTITY_MESSAGE);
        }
        const updatedFeat = rows[0];

        if (body.aptitudeIds !== undefined) {
          await FeatsAptitudes.delete(tx, { featId: targetId });

          if (body.aptitudeIds.length > 0) {
            const spellAptitudes = await PowersAptitudes.findDistinctAptitudeIds(tx, { aptitudeIds: body.aptitudeIds });
            if (spellAptitudes.length > 0) {
              throw new ConflictError("Cannot link feat to aptitude(s) already used for spells");
            }

            await FeatsAptitudes.createMany(tx,
              body.aptitudeIds.map((aptitudeId) => ({
                featId: targetId,
                aptitudeId,
              })),
            );
          }
        }

        await createActivityWithNotifications(tx, {
          userId: session.userId,
          targetId,
          targetTable: getTableName(featsInRules),
          type: "updateFeat",
          data: { entityName: body.name, changedFields: getChangedFields(feat as Record<string, unknown>, body as Record<string, unknown>) },
        });

        return updatedFeat;
      });
    });
    invalidateRuleset(rulesetId);
    return result;
  },

  async deleteRulesetFeat(session: Session, rulesetId: string, featId: string) {
    const result = await withTransaction(async (tx) => {
      return await withRulesetScope(tx, rulesetId, async ({ ruleset, rulesetData }) => {
        const { sourceChain } = rulesetData.cow;

        const inUse = await entityHasCharacterPicks(tx, "feats", featId, rulesetId);
        (await getRulesetPolicy(tx, session, ruleset)).canDeleteEntity({ inUse });

        const feat = rulesetData.featsById.get(featId);
        const isOwned = feat && feat.rulesetId === rulesetId;
        const isInherited = feat && sourceChain.includes(feat.rulesetId);
        if (!feat || (!isOwned && !isInherited)) {
          throw new NotFoundError("Feat not found in this ruleset");
        }

        let targetId = feat.id;
        if (isInherited) {
          const cowResult = await cowEntity(tx, "feats", feat.id, rulesetId, sourceChain, ruleset.extensionRulesetIds);
          targetId = cowResult.id as string;
        }

        // Customizations are polymorphic FKs — Postgres can't cascade these.
        await deleteRequirementsWithCascade(tx, { entityIds: [targetId], entityType: "feats" });
        await deletePropertiesWithCascade(tx, { entityIds: [targetId], entityType: "feats" });
        await deleteModifiersWithCascade(tx, { sourceIds: [targetId], sourceType: "feats" });

        // FK CASCADE on feats_aptitudes.feat_id and klass_level_feats.feat_id
        // wipes those join rows when the feat row is deleted.
        const rows = await Feats.delete(tx, { id: targetId });
        const deletedFeat = rows[0];
        await createActivityWithNotifications(tx, {
          userId: session.userId,
          targetId,
          targetTable: getTableName(featsInRules),
          type: "deleteFeat",
          data: { rulesetId, entityName: feat.name },
        });

        return deletedFeat;
      });
    });
    invalidateRuleset(rulesetId);
    return result;
  },
} as const;

class FeatsService extends BaseService<typeof FeatsMethods> {
  static initialize() {
    return new FeatsService(FeatsMethods);
  }
}

export default FeatsService;
