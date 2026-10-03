import { getTableName } from "drizzle-orm";

import { featsInRules } from "@/drizzle/schema.ts";
import { invalidateRuleset } from "@/server/cache/rulesetCache/index.ts";
import { db, withTransaction } from "@/server/database/index.ts";
import { BadRequestError, ConflictError, STALE_ENTITY_MESSAGE } from "@/server/errors/index.ts";
import { Feats, FeatsAptitudes, PowersAptitudes } from "@/server/repositories/index.ts";
import { createActivityWithNotifications, getChangedFields } from "@/server/services/activities/index.ts";
import { RulesetsPolicy } from "@/server/services/policies/index.ts";
import {
  assertEntityNameAvailable,
  entityHasCharacterPicks,
  entityToDelete,
  entityToEdit,
  findScopedEntity,
  repointTombstoneSnapshot,
  wasGeneratedFeat,
  withRulesetScope,
} from "@/server/services/rulesets/cow/index.ts";
import type { Session } from "@/shared/relations.ts";

class FeatsService {
  async getRulesetFeat(rulesetId: string, featId: string) {
    return await withRulesetScope(db, rulesetId, async ({ rulesetData }) => {
      const { sourceChain } = rulesetData.cow;
      const feat = findScopedEntity(rulesetData.featsById, featId, rulesetId, sourceChain, "Feat");
      return {
        ...feat,
        modifiers: rulesetData.modifiersBySource.get(feat.id) ?? [],
        properties: rulesetData.propertiesByEntity.get(feat.id) ?? [],
        requirements: rulesetData.requirementsByEntity.get(feat.id) ?? [],
      };
    });
  }

  async getRulesetFeats(
    rulesetId: string,
    where: {
      childOnly?: boolean;
      aptitudeId?: string;
      family?: string;
      search?: string;
      orderBy?: "name" | "createdAt" | "updatedAt";
      orderDir?: "asc" | "desc";
    },
    pagination: { limit: number; page: number },
  ) {
    return await withRulesetScope(db, rulesetId, async ({ rulesetData }) => {
      const { sourceChain, siblingIds } = rulesetData.cow;
      const result = await Feats.findPage(db, { rulesetId, ancestorRulesetIds: sourceChain, ...where }, pagination);
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
  }

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
      return await Feats.findGroupPage(
        db,
        { rulesetId, ancestorRulesetIds: sourceChain, aptitudeIds, excludeIds, ...where },
        pagination,
      );
    });
  }

  async createRulesetFeat(
    session: Session,
    rulesetId: string,
    body: {
      name: string;
      description?: string | null;
      aptitudeIds: string[];
    },
  ) {
    const result = await withTransaction(async (tx) => {
      return await withRulesetScope(tx, rulesetId, async ({ ruleset, rulesetData }) => {
        (await RulesetsPolicy.for(tx, session, ruleset)).canUpdateEntity();

        const { tombstoneAncestorId } = await assertEntityNameAvailable(
          tx,
          rulesetId,
          rulesetData.cow,
          "feats",
          body.name,
        );

        if (!body.aptitudeIds || body.aptitudeIds.length === 0) {
          throw new BadRequestError("At least one aptitude must be selected for the feat");
        }

        const spellAptitudes = await PowersAptitudes.findAptitudeIds(tx, { aptitudeIds: body.aptitudeIds });
        if (spellAptitudes.length > 0) {
          throw new ConflictError("Cannot link feat to aptitude(s) already used for spells");
        }

        // Named as an ancestor the fork deleted, the feat stands in for it (`repointTombstoneSnapshot`), checks
        // finding it by that name: generated if the ancestor was
        const rows = await Feats.create(tx, {
          name: body.name,
          description: body.description,
          generated: tombstoneAncestorId ? await wasGeneratedFeat(tx, tombstoneAncestorId) : false,
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
  }

  async updateRulesetFeat(
    session: Session,
    rulesetId: string,
    featId: string,
    body: {
      name: string;
      description?: string | null;
      aptitudeIds?: string[];
      updatedAt?: string;
    },
  ) {
    const result = await withTransaction(async (tx) => {
      return await withRulesetScope(tx, rulesetId, async ({ ruleset, rulesetData }) => {
        const { sourceChain } = rulesetData.cow;

        (await RulesetsPolicy.for(tx, session, ruleset)).canUpdateEntity();

        const feat = findScopedEntity(rulesetData.featsById, featId, rulesetId, sourceChain, "Feat");

        // A generated feat's name names its option (`Weapon Focus: Longsword`), which checks and generators find it by
        if (body.name !== feat.name && feat.generated) {
          throw new BadRequestError("Generated feats cannot be renamed");
        }

        const { id: targetId, copied } = await entityToEdit(tx, ruleset, sourceChain, "feats", feat);
        const expectedUpdatedAt = copied ? undefined : body.updatedAt;

        const rows = await Feats.update(
          tx,
          {
            name: body.name,
            description: body.description,
          },
          { id: targetId, expectedUpdatedAt },
        );
        if (expectedUpdatedAt && rows.length === 0) {
          throw new ConflictError(STALE_ENTITY_MESSAGE);
        }
        const updatedFeat = rows[0];

        if (body.aptitudeIds !== undefined) {
          await FeatsAptitudes.delete(tx, { featId: targetId });

          if (body.aptitudeIds.length > 0) {
            const spellAptitudes = await PowersAptitudes.findAptitudeIds(tx, { aptitudeIds: body.aptitudeIds });
            if (spellAptitudes.length > 0) {
              throw new ConflictError("Cannot link feat to aptitude(s) already used for spells");
            }

            await FeatsAptitudes.createMany(
              tx,
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
          data: {
            entityName: body.name,
            changedFields: getChangedFields(feat, body),
          },
        });

        return updatedFeat;
      });
    });
    invalidateRuleset(rulesetId);
    return result;
  }

  async deleteRulesetFeat(session: Session, rulesetId: string, featId: string) {
    const result = await withTransaction(async (tx) => {
      return await withRulesetScope(tx, rulesetId, async ({ ruleset, rulesetData }) => {
        const { sourceChain } = rulesetData.cow;

        const inUse = await entityHasCharacterPicks(tx, "feats", featId, rulesetId);
        (await RulesetsPolicy.for(tx, session, ruleset)).canDeleteEntity({ inUse });

        const feat = findScopedEntity(rulesetData.featsById, featId, rulesetId, sourceChain, "Feat");

        const targetId = await entityToDelete(tx, ruleset, sourceChain, "feats", feat);

        // FK CASCADE on feats_aptitudes.feat_id and klass_level_feats.feat_id
        // wipes those join rows when the feat row is deleted.
        // The database deletes its customizations with it.
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
  }
}

export default new FeatsService();
