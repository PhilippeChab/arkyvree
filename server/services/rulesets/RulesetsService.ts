import { getTableName } from "drizzle-orm";

import { rulesetsInRules } from "@/drizzle/schema.ts";
import { invalidateRuleset } from "@/server/cache/rulesetCache/index.ts";
import { db, withTransaction } from "@/server/database/index.ts";
import {
  ConflictError,
  ForbiddenError,
  InternalError,
  NotFoundError,
  STALE_ENTITY_MESSAGE,
  UnprocessableEntityError,
} from "@/server/errors/index.ts";
import {
  Activities,
  Contributors,
  Feats,
  Items,
  Klasses,
  Properties,
  Races,
  RulesetExtensions,
  Rulesets,
  Skills,
  StarredRulesets,
} from "@/server/repositories/index.ts";
import { RulesetFactory } from "@/server/rulesets/RulesetFactory.ts";
import { RulesetsPolicy } from "@/server/services/policies/index.ts";
import type { RulesetKind } from "@/shared/enums.ts";
import type { Ruleset, Session } from "@/shared/relations.ts";

import { buildSourceChain } from "./cow/index.ts";

class RulesetsService {
  // A ruleset is starrable iff it's a base (forkable) or an extension
  // (subscribable). Regular forks meant for direct play aren't useful as
  // bookmarks since you can neither fork nor subscribe to them.
  private isStarrable(ruleset: Pick<Ruleset, "rulesetId" | "status" | "private" | "kind">): boolean {
    if (ruleset.private) return false;
    if (ruleset.status !== "Published") return false;
    if (!ruleset.rulesetId) return true;
    return ruleset.kind === "extension";
  }

  private assertCanBeExtension(ruleset: Pick<Ruleset, "rulesetId" | "extensionRulesetIds">) {
    if (!ruleset.rulesetId) {
      throw new UnprocessableEntityError("Only forks can be published as extensions");
    }
    if (ruleset.extensionRulesetIds.length > 0) {
      throw new UnprocessableEntityError("A ruleset that subscribes to extensions cannot itself be an extension");
    }
  }

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

  async archiveRuleset(session: Session, id: string) {
    return await withTransaction(async (tx) => {
      const ruleset = await Rulesets.findOne(tx, { id });
      if (!ruleset) {
        throw new NotFoundError("Ruleset not found");
      }

      (await RulesetsPolicy.for(tx, session, ruleset)).canUpdate();

      // Archive only flips status='Archived'. Entities and overrides stay
      // live so any character or campaign still pointing here keeps
      // resolving its data; the ruleset just becomes read-only at the
      // editing surface.
      const rows = await Rulesets.archive(tx, { id });
      const archivedRuleset = rows[0];

      await Activities.create(tx, {
        userId: session.userId,
        targetId: archivedRuleset.id,
        targetTable: getTableName(rulesetsInRules),
        type: "archiveRuleset",
      });

      return archivedRuleset;
    });
  }

  async unarchiveRuleset(session: Session, id: string) {
    const result = await withTransaction(async (tx) => {
      const ruleset = await Rulesets.findOne(tx, { id });
      if (!ruleset) {
        throw new NotFoundError("Ruleset not found");
      }

      new RulesetsPolicy(session, ruleset).canUnarchive();

      const rows = await Rulesets.unarchive(tx, { id });
      const unarchivedRuleset = rows[0];

      if (!unarchivedRuleset) {
        throw new InternalError("Failed to unarchive ruleset");
      }

      await Activities.create(tx, {
        userId: session.userId,
        targetId: unarchivedRuleset.id,
        targetTable: getTableName(rulesetsInRules),
        type: "unarchiveRuleset",
      });

      return unarchivedRuleset;
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

  async publishRuleset(session: Session, id: string, body: { kind?: RulesetKind } = {}) {
    const result = await withTransaction(async (tx) => {
      // First verify the ruleset exists
      const ruleset = await Rulesets.findOne(tx, { id });
      if (!ruleset) {
        throw new NotFoundError("Ruleset not found");
      }

      new RulesetsPolicy(session, ruleset).canPublish();

      const targetKind = body.kind ?? ruleset.kind;
      if (targetKind === "extension") {
        this.assertCanBeExtension(ruleset);
      }

      // Extensions don't need playable content (races/klasses/skills/feats);
      // they're add-ons layered onto rulesets that already have the basics.
      if (targetKind !== "extension") {
        const sourceChain = buildSourceChain(ruleset);
        const races = await Races.findManyByRulesetId(
          tx,
          { rulesetId: id, ancestorRulesetIds: sourceChain, kind: "pc" },
          { limit: 1, page: 1 },
        );
        const klasses = await Klasses.findManyByRulesetId(
          tx,
          { rulesetId: id, ancestorRulesetIds: sourceChain, kind: "pc" },
          { limit: 1, page: 1 },
        );
        const skills = await Skills.findManyByRulesetId(
          tx,
          { rulesetId: id, ancestorRulesetIds: sourceChain },
          { limit: 1, page: 1 },
        );
        const feats = await Feats.findManyByRulesetId(
          tx,
          { rulesetId: id, ancestorRulesetIds: sourceChain },
          { limit: 1, page: 1 },
        );

        const missing: string[] = [];
        if (races.items.length === 0) missing.push("race");
        if (klasses.items.length === 0) missing.push("class");
        if (skills.items.length === 0) missing.push("skill");
        if (feats.items.length === 0) missing.push("feat");

        if (missing.length > 0) {
          throw new UnprocessableEntityError(`Ruleset requires at least one of each: ${missing.join(", ")}`);
        }
      }

      if (body.kind && body.kind !== ruleset.kind) {
        await Rulesets.update(tx, { kind: body.kind }, { id });
      }

      const rows = await Rulesets.publish(tx, { id });
      const publishedRuleset = rows[0];

      await Activities.create(tx, {
        userId: session.userId,
        targetId: publishedRuleset.id,
        targetTable: getTableName(rulesetsInRules),
        type: "publishRuleset",
      });

      return publishedRuleset;
    });

    invalidateRuleset(id);
    return result;
  }

  async starRuleset(session: Session, rulesetId: string) {
    return await withTransaction(async (tx) => {
      const ruleset = await Rulesets.findOne(tx, { id: rulesetId });
      if (!ruleset) {
        throw new NotFoundError("Ruleset not found");
      }

      if (!this.isStarrable(ruleset)) {
        throw new ForbiddenError("Only base rulesets and extensions can be starred");
      }

      await StarredRulesets.createOrRestore(tx, { userId: session.userId, rulesetId });
    });
  }

  async unstarRuleset(session: Session, rulesetId: string) {
    return await withTransaction(async (tx) => {
      await StarredRulesets.archive(tx, { userId: session.userId, rulesetId });
    });
  }
}

export default new RulesetsService();
