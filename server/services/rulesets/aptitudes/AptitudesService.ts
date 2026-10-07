import { getTableName } from "drizzle-orm";

import { aptitudesInRules } from "@/drizzle/schema.ts";
import { checkAptitudeEdit } from "@/engine/index.ts";
import { findScopedEntity, RulesetCache, withRulesetScope } from "@/server/cache/rulesetCache/index.ts";
import { hasCharacterPicks, RulesetEdit } from "@/server/cow/index.ts";
import { db, withTransaction } from "@/server/database/index.ts";
import { ConflictError, STALE_ENTITY_MESSAGE } from "@/server/errors/index.ts";
import { Aptitudes } from "@/server/repositories/index.ts";
import { createActivityWithNotifications, getChangedFields } from "@/server/services/activities/index.ts";
import { RulesetsPolicy } from "@/server/services/policies/index.ts";
import type { Session } from "@/shared/relations.ts";

class AptitudesService {
  async createAptitude(
    session: Session,
    rulesetId: string,
    body: {
      description?: string | null;
      name: string;
    },
  ) {
    const result = await withTransaction(
      async (tx) =>
        await withRulesetScope(tx, rulesetId, async ({ ruleset, rulesetData }) => {
          (await RulesetsPolicy.for(tx, session, ruleset)).canUpdateEntity();

          const edit = new RulesetEdit(ruleset, rulesetData.cow);
          const { tombstoneAncestorId } = await edit.assertNameAvailable(tx, "aptitudes", body.name);

          const rows = await Aptitudes.create(tx, {
            ...body,
            rulesetId,
          });
          const aptitude = rows[0];

          if (tombstoneAncestorId) await edit.repointTombstone(tx, "aptitudes", tombstoneAncestorId, aptitude.id);

          await createActivityWithNotifications(tx, {
            userId: session.userId,
            targetId: aptitude.id,
            targetTable: getTableName(aptitudesInRules),
            type: "createAptitude",
            data: { entityName: aptitude.name },
          });

          return aptitude;
        }),
    );
    RulesetCache.invalidate(rulesetId);
    return result;
  }

  async deleteAptitude(session: Session, rulesetId: string, aptitudeId: string) {
    const result = await withTransaction(
      async (tx) =>
        await withRulesetScope(tx, rulesetId, async ({ ruleset, rulesetData }) => {
          const { sourceChain } = rulesetData.cow;

          const inUse = await hasCharacterPicks(tx, "aptitudes", aptitudeId, rulesetId);
          (await RulesetsPolicy.for(tx, session, ruleset)).canDeleteEntity({ inUse });

          const aptitude = findScopedEntity(rulesetData.aptitudesById, aptitudeId, rulesetId, sourceChain, "Aptitude");
          checkAptitudeEdit({ ruleset, rulesetData }, aptitude);

          const edit = new RulesetEdit(ruleset, rulesetData.cow);
          const targetId = await edit.cowToDelete(tx, "aptitudes", aptitude);

          // FK CASCADE on feats_aptitudes / powers_aptitudes / klass_level_feats /
          // klass_level_powers wipes the join rows pointing at this aptitude.
          // The database deletes its customizations with it.
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
        }),
    );
    RulesetCache.invalidate(rulesetId);
    return result;
  }

  async getAptitude(rulesetId: string, aptitudeId: string) {
    return await withRulesetScope(db, rulesetId, async ({ rulesetData }) => {
      const { sourceChain } = rulesetData.cow;
      const aptitude = findScopedEntity(rulesetData.aptitudesById, aptitudeId, rulesetId, sourceChain, "Aptitude");
      return aptitude;
    });
  }

  async getAptitudes(
    rulesetId: string,
    where: {
      childOnly?: boolean;
      orderBy?: "name" | "createdAt" | "updatedAt";
      orderDir?: "asc" | "desc";
      scope?: "feats" | "spells";
      search?: string;
    },
    pagination: { limit: number; page: number },
  ) {
    return await withRulesetScope(db, rulesetId, async ({ rulesetData }) => {
      const { sourceChain } = rulesetData.cow;
      return await Aptitudes.findPage(db, { rulesetId, ancestorRulesetIds: sourceChain, ...where }, pagination);
    });
  }

  async updateAptitude(
    session: Session,
    rulesetId: string,
    aptitudeId: string,
    body: {
      description?: string | null;
      name: string;
      updatedAt?: string;
    },
  ) {
    const result = await withTransaction(
      async (tx) =>
        await withRulesetScope(tx, rulesetId, async ({ ruleset, rulesetData }) => {
          const { sourceChain } = rulesetData.cow;

          (await RulesetsPolicy.for(tx, session, ruleset)).canUpdateEntity();

          const aptitude = findScopedEntity(rulesetData.aptitudesById, aptitudeId, rulesetId, sourceChain, "Aptitude");
          checkAptitudeEdit({ ruleset, rulesetData }, aptitude, body.name);

          const edit = new RulesetEdit(ruleset, rulesetData.cow);
          const { id: targetId, copied } = await edit.cowToEdit(tx, "aptitudes", aptitude);
          const expectedUpdatedAt = copied ? undefined : body.updatedAt;

          const { updatedAt: _u, ...aptitudeData } = body;
          const rows = await Aptitudes.update(tx, aptitudeData, { id: targetId, expectedUpdatedAt });
          if (expectedUpdatedAt && rows.length === 0) throw new ConflictError(STALE_ENTITY_MESSAGE);

          const updatedAptitude = rows[0];

          await createActivityWithNotifications(tx, {
            userId: session.userId,
            targetId,
            targetTable: getTableName(aptitudesInRules),
            type: "updateAptitude",
            data: {
              entityName: body.name,
              changedFields: getChangedFields(aptitude, body),
            },
          });

          return updatedAptitude;
        }),
    );
    RulesetCache.invalidate(rulesetId);
    return result;
  }
}

export default new AptitudesService();
