import { getTableName } from "drizzle-orm";

import { rulesetsInRules } from "@/drizzle/schema.ts";
import { invalidateRuleset } from "@/server/cache/rulesetCache/index.ts";
import { db, withTransaction } from "@/server/database/index.ts";
import { ConflictError, ForbiddenError, NotFoundError, STALE_ENTITY_MESSAGE } from "@/server/errors/index.ts";
import { include } from "@/server/mixins.ts";
import {
  Activities,
  Contributors,
  Items,
  Properties,
  RulesetExtensions,
  Rulesets,
  StarredRulesets,
} from "@/server/repositories/index.ts";
import { RulesetFactory } from "@/server/rulesets/RulesetFactory.ts";
import { RulesetsPolicy } from "@/server/services/policies/index.ts";
import type { RulesetKind } from "@/shared/enums.ts";
import type { Session } from "@/shared/relations.ts";

import { Archives } from "./concerns/Archives.ts";
import { Publishes } from "./concerns/Publishes.ts";
import { Stars } from "./concerns/Stars.ts";

class RulesetsService extends include(Object, Stars, Archives, Publishes) {
  async getAllRulesets(
    session: Session,
    where: {
      scope?:
        | "base"
        | "forked"
        | "community"
        | "createdByMe"
        | "createdByMePrivate"
        | "archived"
        | "published"
        | "starred"
        | "campaignAccessible"
        | "myDrafts"
        | "extensions"
        | "systems"
        | "contributedTo";
      search?: string;
      orderBy?: "createdAt" | "updatedAt";
      orderDir?: "asc" | "desc";
    },
    pagination: { limit: number; page: number },
  ) {
    const rulesets = await Rulesets.findMany(db, session, where, pagination);

    // Batch-check starred status + star counts
    const rulesetIds = rulesets.items.map((r) => r.id);
    const [starred, starCounts] = await Promise.all([
      StarredRulesets.findMany(db, { userId: session.userId }),
      StarredRulesets.countByRulesetIds(db, { rulesetIds }),
    ]);
    const starredSet = new Set(starred.map((s) => s.rulesetId));

    // Batch-fetch parent rulesets for forked rulesets
    const parentRulesetIds = [
      ...new Set(rulesets.items.map((r) => r.rulesetId).filter((id): id is string => id !== null)),
    ];
    const parentRulesets =
      parentRulesetIds.length > 0 ? await Rulesets.findManyByIds(db, { ids: parentRulesetIds }) : [];
    const parentNameMap = new Map(parentRulesets.map((r) => [r.id, r.name]));

    const items = rulesets.items.map((ruleset) => ({
      ...ruleset,
      rulesetName: ruleset.rulesetId ? parentNameMap.get(ruleset.rulesetId) : undefined,
      isStarred: starredSet.has(ruleset.id),
      starCount: starCounts.get(ruleset.id) ?? 0,
      isStarrable: this.isStarrable(ruleset),
    }));

    return {
      ...rulesets,
      items,
    };
  }

  async getRulesetById(session: Session, id: string) {
    const ruleset = await Rulesets.findOne(db, { id });
    if (!ruleset) {
      throw new NotFoundError("Ruleset not found");
    }

    const [star, starCount, contributorRole, isUsedAsExtension] = await Promise.all([
      StarredRulesets.findOne(db, { userId: session.userId, rulesetId: id }),
      StarredRulesets.countByRulesetId(db, { rulesetId: id }),
      ruleset.userId && ruleset.userId !== session.userId
        ? Contributors.findActiveRole(db, { userId: session.userId, rulesetId: id })
        : null,
      Rulesets.hasSubscribers(db, id),
    ]);

    const parent = ruleset.rulesetId ? await Rulesets.findOne(db, { id: ruleset.rulesetId }) : undefined;

    return {
      ...ruleset,
      rulesetName: parent?.name,
      isStarred: !!star,
      starCount,
      contributorRole,
      isStarrable: this.isStarrable(ruleset),
      isUsedAsExtension,
    };
  }

  async updateRuleset(
    session: Session,
    id: string,
    body: { name: string; description: string; private?: boolean; kind?: RulesetKind; updatedAt?: string },
  ) {
    const result = await withTransaction(async (tx) => {
      // First verify the ruleset exists
      const ruleset = await Rulesets.findOne(tx, { id });
      if (!ruleset) {
        throw new NotFoundError("Ruleset not found");
      }

      (await RulesetsPolicy.for(tx, session, ruleset)).canUpdate();

      if (!ruleset.private && body.private) {
        throw new ForbiddenError("Cannot make a public ruleset private");
      }

      if (body.kind === "extension" && ruleset.kind !== "extension") {
        this.assertCanBeExtension(ruleset);
      }

      const { updatedAt, ...rulesetData } = body;
      const rows = await Rulesets.update(tx, rulesetData, { id, expectedUpdatedAt: updatedAt });
      if (updatedAt && rows.length === 0) {
        throw new ConflictError(STALE_ENTITY_MESSAGE);
      }
      const updatedRuleset = rows[0];

      await Activities.create(tx, {
        userId: session.userId,
        targetId: updatedRuleset.id,
        targetTable: getTableName(rulesetsInRules),
        type: "updateRuleset",
      });

      return updatedRuleset;
    });

    invalidateRuleset(id);
    return result;
  }

  async forkRuleset(session: Session, id: string, body: { name: string; description?: string; private: boolean }) {
    const result = await withTransaction(async (tx) => {
      // 1. Verify source ruleset exists and is published
      const ruleset = await Rulesets.findOne(tx, { id });
      if (!ruleset) {
        throw new NotFoundError("Ruleset not found");
      }
      new RulesetsPolicy(session, ruleset).canFork();

      // 2. Verify name uniqueness
      const existing = await Rulesets.findOne(tx, { name: body.name });
      if (existing) {
        throw new ConflictError("A ruleset with this name already exists");
      }

      // canFork blocks forks-of-forks, so the parent is always a base —
      // ancestorRulesetIds is always [baseId].
      const ancestorRulesetIds = [id];

      // 4. Create the new forked ruleset
      const newRuleset = (
        await Rulesets.create(tx, {
          name: body.name,
          description: body.description || ruleset.description,
          userId: session.userId,
          rulesetId: id,
          ancestorRulesetIds,
          extensionRulesetIds: ruleset.extensionRulesetIds,
          baseRules: ruleset.baseRules,
          private: body.private,
        })
      )[0];

      // Copy extension metadata rows
      if (ruleset.extensionRulesetIds.length > 0) {
        for (const extId of ruleset.extensionRulesetIds) {
          await RulesetExtensions.upsert(tx, { rulesetId: newRuleset.id, extensionId: extId });
        }
      }

      // 3. Copy ruleset-level properties as-is (parent entity IDs — resolveOverrides handles at read time)
      const sourceRulesetProperties = await Properties.findManyByEntity(tx, {
        entityIds: [id],
        entityType: "rulesets",
      });
      if (sourceRulesetProperties.length > 0) {
        await Properties.createMany(
          tx,
          sourceRulesetProperties.map((p) => ({
            ...p,
            id: undefined,
            entityId: newRuleset.id,
          })),
        );
      }

      // 4. Seed template items if source ruleset didn't have any (pre-migration rulesets)
      const rulesetModule = RulesetFactory.fromBaseRules(ruleset.baseRules);
      const sourceTemplates = await Items.findTemplates(tx, { rulesetId: id });
      if (sourceTemplates.length === 0) {
        await rulesetModule.seedTemplateItems(tx, newRuleset.id);
      }

      // 5. Log the fork activity
      await Activities.create(tx, {
        userId: session.userId,
        targetId: newRuleset.id,
        targetTable: getTableName(rulesetsInRules),
        type: "forkRuleset",
        data: { sourceRulesetId: id },
      });

      return newRuleset;
    });

    invalidateRuleset(result.id);
    return result;
  }
}

export default new RulesetsService();
