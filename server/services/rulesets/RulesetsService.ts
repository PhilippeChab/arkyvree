import { include } from "@/lib/mixins.ts";
import { RulesetViews, withRulesetScope } from "@/server/cow/index.ts";
import { db, withTransaction } from "@/server/database/index.ts";
import { ConflictError, ForbiddenError, STALE_ENTITY_MESSAGE } from "@/server/errors/index.ts";
import {
  Activities,
  type Pagination,
  RulesetExtensions,
  Rulesets,
  RulesetSettings,
  StarredRulesets,
} from "@/server/repositories/index.ts";
import { isAllowed, type RulesetsPolicy } from "@/server/services/policies/index.ts";
import { TARGET_TYPES } from "@/shared/activityTargets.ts";
import type { RulesetKind } from "@/shared/enums.ts";
import type { Session } from "@/shared/relations.ts";

import { Archives } from "./concerns/Archives.ts";
import { Publishes } from "./concerns/Publishes.ts";
import { Stars } from "./concerns/Stars.ts";
import { getReadableRuleset } from "./readableRuleset.ts";

class RulesetsService extends include(Object, Archives, Publishes, Stars) {
  /**
   * What the session may do with a ruleset, as its policy decides each (`policy`), so a page offers what the server
   * allows: edit its entities, edit the ruleset itself, fork it, unarchive it, see its contributors, invite and manage
   * them, change their roles, manage its Admins, publish it, subscribe it to extensions (`usedAsExtension`: another
   * ruleset subscribes to it) and unsubscribe it from one (whether a character uses what would leave is the server's
   * answer once asked), see its local changes, and whether it can be an extension, which its edit and its publish
   * offer. It may leave it while it contributes to it (`contributorRole`: an active role, its owner's never looked up).
   */
  private permissionsOf(policy: RulesetsPolicy, usedAsExtension: boolean) {
    return {
      canBeExtension: isAllowed(() => policy.canBeExtension()),
      canEditEntities: isAllowed(() => policy.canUpdateEntity()),
      canEditRuleset: isAllowed(() => policy.canUpdate()),
      canFork: isAllowed(() => policy.canFork()),
      canInviteContributors: isAllowed(() => policy.canInviteContributors()),
      canLeave: policy.contributorRole !== undefined,
      canManageAdminContributors: isAllowed(() => policy.canManageAdminContributors()),
      canManageContributors: isAllowed(() => policy.canManageContributors()),
      canPublish: isAllowed(() => policy.canPublish()),
      canReadContributors: isAllowed(() => policy.canReadContributors()),
      canSubscribeExtensions: isAllowed(() => policy.canSubscribeExtension({ usedAsExtension })),
      canUnarchive: isAllowed(() => policy.canUnarchive()),
      canUnsubscribeExtensions: isAllowed(() => policy.canUnsubscribeExtension()),
      canUpdateContributorRoles: isAllowed(() => policy.canUpdateContributorRole()),
      canViewChanges: isAllowed(() => policy.canViewChanges()),
    };
  }

  async forkRuleset(session: Session, id: string, body: { description?: string; name: string; private: boolean }) {
    const result = await withTransaction(async (tx) => {
      // 1. Verify source ruleset exists and is published
      const { policy, ruleset } = await getReadableRuleset(tx, session, id);
      policy.canFork();

      // 2. Verify name uniqueness
      const existing = await Rulesets.findOne(tx, { name: body.name });
      if (existing) throw new ConflictError("A ruleset with this name already exists");

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
          baseRules: ruleset.baseRules,
          private: body.private,
        })
      )[0];

      // The fork subscribes to its source's extensions, in their order
      await RulesetExtensions.upsert(tx, { rulesetId: newRuleset.id, extensionIds: ruleset.extensionIds });

      // 3. Copy the ruleset's Settings as stored (parent entity IDs, which the fork's view resolves at read time)
      await RulesetSettings.createCopy(tx, { fromId: id, toId: newRuleset.id });

      // 4. Log the fork activity
      await Activities.create(tx, {
        userId: session.userId,
        targetId: newRuleset.id,
        targetType: TARGET_TYPES.rulesets,
        type: "forkRuleset",
        data: { sourceRulesetId: id },
      });

      // Its row was written before its extensions' rows were, which it answers with
      return { ...newRuleset, extensionIds: ruleset.extensionIds };
    });

    RulesetViews.invalidate(result.id);
    return result;
  }

  async getRuleset(session: Session, id: string) {
    const { policy, ruleset } = await getReadableRuleset(db, session, id);

    const [star, starCount, usedAsExtension] = await Promise.all([
      StarredRulesets.findOne(db, { userId: session.userId, rulesetId: id }),
      StarredRulesets.count(db, { rulesetId: id }),
      Rulesets.exists(db, { subscribedTo: id }),
    ]);

    const parent = ruleset.rulesetId ? await Rulesets.findOne(db, { id: ruleset.rulesetId }) : undefined;

    return {
      ...ruleset,
      rulesetName: parent?.name,
      isStarred: !!star,
      starCount,
      // A response says none with null: JSON leaves an undefined key out
      contributorRole: policy.contributorRole ?? null,
      isStarrable: this.isStarrable(ruleset),
      permissions: this.permissionsOf(policy, usedAsExtension),
    };
  }

  async getRulesets(
    session: Session,
    where: {
      kind?: RulesetKind;
      orderBy?: "createdAt" | "updatedAt";
      orderDir?: "asc" | "desc";
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
    },
    pagination: Pagination,
  ) {
    const rulesets = await Rulesets.findPage(db, session, where, pagination);

    // Batch-check starred status + star counts
    const rulesetIds = rulesets.items.map((r) => r.id);
    const [starred, starCounts] = await Promise.all([
      StarredRulesets.findMany(db, { userId: session.userId }),
      StarredRulesets.countPerRuleset(db, { rulesetIds }),
    ]);
    const starredSet = new Set(starred.map((s) => s.rulesetId));

    // Batch-fetch parent rulesets for forked rulesets
    const parentRulesetIds = [
      ...new Set(rulesets.items.map((r) => r.rulesetId).filter((id): id is string => id !== null)),
    ];
    const parentRulesets = await Rulesets.findMany(db, { ids: parentRulesetIds });
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

  async updateRuleset(
    session: Session,
    id: string,
    body: { description: string; kind?: RulesetKind; name: string; private?: boolean; updatedAt?: string },
  ) {
    const result = await withTransaction(async (tx) => {
      // First verify the ruleset exists
      const { policy, ruleset } = await getReadableRuleset(tx, session, id);
      policy.canUpdate();

      if (!ruleset.private && body.private) throw new ForbiddenError("Cannot make a public ruleset private");

      const { kind } = body;
      if (kind && kind !== ruleset.kind) {
        // A published ruleset becomes what publishing it as `kind` would make it; a draft's content is checked when
        // it's published
        if (ruleset.status === "Published")
          await withRulesetScope(tx, id, async (scope) => this.checkKind(scope, policy, kind));
        else if (kind === "extension") policy.canBeExtension();
      }

      const { updatedAt, ...columns } = body;
      const rows = await Rulesets.update(tx, columns, { id, expectedUpdatedAt: updatedAt });
      if (updatedAt && rows.length === 0) throw new ConflictError(STALE_ENTITY_MESSAGE);

      const updatedRuleset = rows[0];

      await Activities.create(tx, {
        userId: session.userId,
        targetId: updatedRuleset.id,
        targetType: TARGET_TYPES.rulesets,
        type: "updateRuleset",
      });

      return updatedRuleset;
    });

    RulesetViews.invalidate(id);
    return result;
  }
}

export default new RulesetsService();
