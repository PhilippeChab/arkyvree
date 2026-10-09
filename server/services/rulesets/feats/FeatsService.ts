import { getTableName } from "drizzle-orm";

import { featsInRules } from "@/drizzle/schema.ts";
import { Engine } from "@/engine/index.ts";
import { hasCharacterPicks, RulesetEdit, RulesetViews, withRulesetScope } from "@/server/cow/index.ts";
import { type Db, db, withCowContext, withTransaction } from "@/server/database/index.ts";
import { ConflictError, STALE_ENTITY_MESSAGE } from "@/server/errors/index.ts";
import { Feats, FeatsAptitudes } from "@/server/repositories/index.ts";
import { createActivityWithNotifications, getChangedFields } from "@/server/services/activities/index.ts";
import { RulesetsPolicy } from "@/server/services/policies/index.ts";
import type { Session } from "@/shared/relations.ts";

class FeatsService {
  /**
   * Whether the ancestor feat a fork deleted was generated, read by its stored id: a new feat with its name stands in
   * for it (`RulesetEdit.repointTombstone`), and takes its mark.
   */
  private async wasGenerated(tx: Db, ancestorFeatId: string): Promise<boolean> {
    const feat = await withCowContext(undefined, () => Feats.findOne(tx, { id: ancestorFeatId }));
    return feat?.generated ?? false;
  }

  async createFeat(
    session: Session,
    rulesetId: string,
    body: {
      aptitudeIds: string[];
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
          const { tombstoneAncestorId } = await edit.assertNameAvailable(tx, "feats", body.name);

          // Named as an ancestor the fork deleted, the feat stands in for it (`RulesetEdit.repointTombstone`), checks
          // finding it by that name
          const plan = Engine.for(scope)
            .feats()
            .planCreate(body, {
              tombstoneGenerated: tombstoneAncestorId ? await this.wasGenerated(tx, tombstoneAncestorId) : false,
            });
          const rows = await Feats.create(tx, { ...plan.columns, rulesetId });
          const feat = rows[0];

          if (tombstoneAncestorId) await edit.repointTombstone(tx, "feats", tombstoneAncestorId, feat.id);

          for (const aptitudeId of plan.aptitudeIds) {
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
        }),
    );
    RulesetViews.invalidate(rulesetId);
    return result;
  }

  async deleteFeat(session: Session, rulesetId: string, featId: string) {
    const result = await withTransaction(
      async (tx) =>
        await withRulesetScope(tx, rulesetId, async (scope) => {
          const { ruleset, rulesetData } = scope;
          const inUse = await hasCharacterPicks(tx, "feats", featId, rulesetId);
          (await RulesetsPolicy.for(tx, session, ruleset)).canDeleteEntity({ inUse });

          const feat = Engine.for(scope).entity("feats", featId).get();

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
        }),
    );
    RulesetViews.invalidate(rulesetId);
    return result;
  }

  async getFeat(rulesetId: string, featId: string) {
    return await withRulesetScope(db, rulesetId, async (scope) => Engine.for(scope).entity("feats", featId).describe());
  }

  async getFeatGroups(
    rulesetId: string,
    where: { aptitudeId?: string; childOnly?: boolean; search?: string },
    pagination: { limit: number; page: number },
  ) {
    return await withRulesetScope(db, rulesetId, async (scope) => {
      const { aptitudeId, ...filters } = where;
      const list = Engine.for(scope).feats().openList({ aptitudeId });
      return await Feats.findGroupPage(
        db,
        { rulesetId, ancestorRulesetIds: scope.rulesetData.cow.sourceChain, ...list.groupFilters, ...filters },
        pagination,
      );
    });
  }

  async getFeats(
    rulesetId: string,
    where: {
      aptitudeId?: string;
      childOnly?: boolean;
      family?: string;
      orderBy?: "name" | "createdAt" | "updatedAt";
      orderDir?: "asc" | "desc";
      search?: string;
    },
    pagination: { limit: number; page: number },
  ) {
    return await withRulesetScope(db, rulesetId, async (scope) => {
      const { aptitudeId, family, ...filters } = where;
      const list = Engine.for(scope).feats().openList({ aptitudeId, childOnly: where.childOnly, family });
      const result = await Feats.findPage(
        db,
        { rulesetId, ancestorRulesetIds: scope.rulesetData.cow.sourceChain, ...filters, ...list.filters },
        pagination,
      );
      return { ...result, items: list.describe(result.items) };
    });
  }

  async updateFeat(
    session: Session,
    rulesetId: string,
    featId: string,
    body: {
      aptitudeIds?: string[];
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

          const { aptitudeIds, columns, feat } = Engine.for(scope).feats().planEdit(featId, body);

          const edit = new RulesetEdit(ruleset, rulesetData.cow);
          const { id: targetId, copied } = await edit.cowToEdit(tx, "feats", feat);
          const expectedUpdatedAt = copied ? undefined : body.updatedAt;

          const rows = await Feats.update(tx, columns, { id: targetId, expectedUpdatedAt });
          if (expectedUpdatedAt && rows.length === 0) throw new ConflictError(STALE_ENTITY_MESSAGE);

          const updatedFeat = rows[0];

          if (aptitudeIds !== undefined) {
            await FeatsAptitudes.delete(tx, { featId: targetId });
            await FeatsAptitudes.createMany(
              tx,
              aptitudeIds.map((aptitudeId) => ({ featId: targetId, aptitudeId })),
            );
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
        }),
    );
    RulesetViews.invalidate(rulesetId);
    return result;
  }
}

export default new FeatsService();
