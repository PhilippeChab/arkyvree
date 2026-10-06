import { getTableName } from "drizzle-orm";

import { featsInRules } from "@/drizzle/schema.ts";
import { findScopedEntity, RulesetCache } from "@/server/cache/rulesetCache/index.ts";
import { withRulesetScope } from "@/server/cache/rulesetCache/index.ts";
import { hasCharacterPicks, RulesetEdit, wasGeneratedFeat } from "@/server/cow/index.ts";
import { db, withTransaction } from "@/server/database/index.ts";
import { BadRequestError, ConflictError, STALE_ENTITY_MESSAGE } from "@/server/errors/index.ts";
import { Feats, FeatsAptitudes, PowersAptitudes } from "@/server/repositories/index.ts";
import { createActivityWithNotifications, getChangedFields } from "@/server/services/activities/index.ts";
import { RulesetsPolicy } from "@/server/services/policies/index.ts";
import { getListFeatIds } from "@/server/services/rulesets/aptitudes/index.ts";
import type { Session } from "@/shared/relations.ts";

class FeatsService {
  async createFeat(
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

        const edit = new RulesetEdit(ruleset, rulesetData.cow);
        const { tombstoneAncestorId } = await edit.assertNameAvailable(tx, "feats", body.name);

        if (!body.aptitudeIds || body.aptitudeIds.length === 0) {
          throw new BadRequestError("At least one aptitude must be selected for the feat");
        }

        const spellAptitudes = await PowersAptitudes.findAptitudeIds(tx, { aptitudeIds: body.aptitudeIds });
        if (spellAptitudes.length > 0) {
          throw new ConflictError("Cannot link feat to aptitude(s) already used for spells");
        }

        // Named as an ancestor the fork deleted, the feat stands in for it (`RulesetEdit.repointTombstone`), checks
        // finding it by that name: generated if the ancestor was
        const rows = await Feats.create(tx, {
          name: body.name,
          description: body.description,
          generated: tombstoneAncestorId ? await wasGeneratedFeat(tx, tombstoneAncestorId) : false,
          rulesetId,
        });
        const feat = rows[0];

        if (tombstoneAncestorId) {
          await edit.repointTombstone(tx, "feats", tombstoneAncestorId, feat.id);
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
    RulesetCache.invalidate(rulesetId);
    return result;
  }

  async deleteFeat(session: Session, rulesetId: string, featId: string) {
    const result = await withTransaction(async (tx) => {
      return await withRulesetScope(tx, rulesetId, async ({ ruleset, rulesetData }) => {
        const { sourceChain } = rulesetData.cow;

        const inUse = await hasCharacterPicks(tx, "feats", featId, rulesetId);
        (await RulesetsPolicy.for(tx, session, ruleset)).canDeleteEntity({ inUse });

        const feat = findScopedEntity(rulesetData.featsById, featId, rulesetId, sourceChain, "Feat");

        const edit = new RulesetEdit(ruleset, rulesetData.cow);
        const targetId = await edit.cowToDelete(tx, "feats", feat);

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
    RulesetCache.invalidate(rulesetId);
    return result;
  }

  async getFeat(rulesetId: string, featId: string) {
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

  async getFeatGroups(
    rulesetId: string,
    where: { childOnly?: boolean; aptitudeId?: string; search?: string },
    pagination: { limit: number; page: number },
  ) {
    return await withRulesetScope(db, rulesetId, async ({ rulesetData }) => {
      const { sourceChain } = rulesetData.cow;
      const { aptitudeId, ...filters } = where;
      const ids = aptitudeId === undefined ? undefined : getListFeatIds(rulesetData, aptitudeId);
      return await Feats.findGroupPage(db, { rulesetId, ancestorRulesetIds: sourceChain, ids, ...filters }, pagination);
    });
  }

  async getFeats(
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
      const { sourceChain } = rulesetData.cow;
      const { aptitudeId, ...filters } = where;
      const ids = aptitudeId === undefined ? undefined : getListFeatIds(rulesetData, aptitudeId);
      const result = await Feats.findPage(
        db,
        { rulesetId, ancestorRulesetIds: sourceChain, ...filters, ids },
        pagination,
      );
      // Each inherited feat's lists as the ruleset composes them: its siblings' links merged in, their ids remapped
      if (sourceChain.length > 0 && !where.childOnly) {
        result.items = result.items.map((feat) => {
          const merged = rulesetData.featsById.get(feat.id);
          return merged ? { ...feat, featsAptitudesInRules: merged.featsAptitudesInRules } : feat;
        });
      }
      return result;
    });
  }

  async updateFeat(
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

        const edit = new RulesetEdit(ruleset, rulesetData.cow);
        const { id: targetId, copied } = await edit.cowToEdit(tx, "feats", feat);
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
    RulesetCache.invalidate(rulesetId);
    return result;
  }
}

export default new FeatsService();
