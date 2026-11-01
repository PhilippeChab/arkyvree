import type { Db } from "@/drizzle/database.ts";
import { include } from "@/lib/mixins.ts";
import { type LockedRulesetScope, RulesetViews } from "@/server/cow/index.ts";
import { db, withUniqueRefusal } from "@/server/database/index.ts";
import { ConflictError, STALE_ENTITY_MESSAGE } from "@/server/errors/index.ts";
import {
  Activities,
  type Pagination,
  RulesetExtensions,
  Rulesets,
  StarredRulesets,
} from "@/server/repositories/index.ts";
import { isAllowed, isStarrable, type RulesetsPolicy } from "@/server/services/policies/index.ts";
import { TARGET_TYPES } from "@/shared/activityTargets.ts";
import type { RulesetKind } from "@/shared/enums.ts";
import type { Ruleset, Session } from "@/shared/relations.ts";

import { Archives } from "./concerns/Archives.ts";
import { Publishes } from "./concerns/Publishes.ts";
import { Stars } from "./concerns/Stars.ts";
import { getReadableRuleset } from "./readableRuleset.ts";
import { withLockedRuleset, withRulesetWrite } from "./rulesetWrites.ts";

/** A ruleset's update: its own row's columns, and the token of the row the client read (`updatedAt`). */
interface RulesetUpdate {
  description: string;
  kind?: RulesetKind;
  name: string;
  private?: boolean;
  updatedAt?: string;
}

/**
 * The unique index that keeps a ruleset's name its own (`drizzle/schema.ts`): across every user's rulesets, a private,
 * an archived or an orphaned one's too.
 */
const NAME_INDEX = "rulesets_name_unique_idx";

class RulesetsService extends include(Object, Archives, Publishes, Stars) {
  /**
   * What the session may do with a ruleset, as its policy decides each (`policy`), so a page offers what the server
   * allows: edit its entities, edit the ruleset itself (make it private too, while it isn't public), fork it, unarchive
   * it, see its contributors, invite and manage them, change their roles, manage its Admins, publish it, subscribe it
   * to extensions (`usedAsExtension`: another ruleset subscribes to it) and unsubscribe it from one (whether a
   * character uses what would leave is the server's answer once asked), see its local changes, and whether it can be an
   * extension (`hasExtensions`: it subscribes to one), which its edit and its publish offer. It may leave it while it
   * contributes to it (`contributorRole`: an active role, its owner's never looked up).
   */
  private permissionsOf(
    policy: RulesetsPolicy,
    { hasExtensions, usedAsExtension }: { hasExtensions: boolean; usedAsExtension: boolean },
  ) {
    return {
      canBeExtension: isAllowed(() => policy.canBeExtension({ hasExtensions })),
      canEditEntities: isAllowed(() => policy.canUpdateEntity()),
      canEditRuleset: isAllowed(() => policy.canUpdate()),
      canFork: isAllowed(() => policy.canFork()),
      canInviteContributors: isAllowed(() => policy.canInviteContributors()),
      canLeave: policy.contributorRole !== undefined,
      canMakePrivate: isAllowed(() => policy.canUpdate({ private: true })),
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

  /**
   * Updates a ruleset's own row (`body`), under its lock, the session's policy on it and the ruleset as the lock read
   * it: a kind change of a published one checks its content on its view (`scope`, a write's fresh one), refused as
   * stale when the write read none (the ruleset was published since its status was read).
   */
  private async applyUpdate(
    tx: Db,
    session: Session,
    { policy, ruleset, scope }: { policy: RulesetsPolicy; ruleset: Ruleset; scope?: LockedRulesetScope },
    body: RulesetUpdate,
  ) {
    policy.canUpdate({ private: body.private });

    const { kind } = body;
    if (kind && kind !== ruleset.kind) {
      // A published ruleset becomes what publishing it as `kind` would make it; a draft's content is checked when
      // it's published
      if (ruleset.status === "Published") {
        if (!scope) throw new ConflictError(STALE_ENTITY_MESSAGE);
        this.checkKind(scope, policy, kind);
      } else if (kind === "extension") {
        const { extensionIds } = (await Rulesets.findSources(tx, { id: ruleset.id }))!;
        policy.canBeExtension({ hasExtensions: extensionIds.length > 0 });
      }
    }

    // A stale edit updates no row, so it's told it's stale before its name is checked
    const { updatedAt, ...columns } = body;
    const rows = await this.withNameRefusal(() =>
      Rulesets.update(tx, columns, { id: ruleset.id, expectedUpdatedAt: updatedAt }),
    );
    if (updatedAt && rows.length === 0) throw new ConflictError(STALE_ENTITY_MESSAGE);

    const updatedRuleset = rows[0];

    await Activities.create(tx, {
      userId: session.userId,
      targetId: updatedRuleset.id,
      targetType: TARGET_TYPES.rulesets,
      type: "updateRuleset",
    });

    return updatedRuleset;
  }

  /**
   * Runs `write`, which sets a ruleset's name, answering the name index's refusal with a 409: the index is the name's
   * one check, a fork's and an edit's, so two requests that claim one name at once are refused alike.
   */
  private async withNameRefusal<T>(write: () => Promise<T>) {
    return await withUniqueRefusal(write, (index) =>
      index === NAME_INDEX ? new ConflictError("A ruleset with this name already exists") : undefined,
    );
  }

  async forkRuleset(session: Session, id: string, body: { description?: string; name: string; private: boolean }) {
    const result = await withLockedRuleset(
      session,
      id,
      async (tx, policy, ruleset) => {
        // 1. Verify source ruleset exists and is published
        policy.canFork();

        // 2. Create the new forked ruleset: canFork blocks forks-of-forks, so its parent is always a base
        const newRuleset = (
          await this.withNameRefusal(() =>
            Rulesets.create(tx, {
              name: body.name,
              description: body.description || ruleset.description,
              userId: session.userId,
              rulesetId: id,
              baseRules: ruleset.baseRules,
              private: body.private,
            }),
          )
        )[0];

        // The fork subscribes to its source's extensions, in their order
        const { extensionIds } = (await Rulesets.findSources(tx, { id }))!;
        await RulesetExtensions.upsert(tx, { rulesetId: newRuleset.id, extensionIds });

        // 3. Log the fork activity. Its Settings are its chain's (`rulesetValuesOf`), as all it inherits is, until it
        // saves its own: none is copied
        await Activities.create(tx, {
          userId: session.userId,
          targetId: newRuleset.id,
          targetType: TARGET_TYPES.rulesets,
          type: "forkRuleset",
          data: { sourceRulesetId: id },
        });

        return newRuleset;
      },
      "share",
    );

    RulesetViews.invalidate(result.id);
    return result;
  }

  async getRuleset(session: Session, id: string) {
    const { policy, ruleset } = await getReadableRuleset(db, session, id);

    const [star, starCount, usedAsExtension, sources] = await Promise.all([
      StarredRulesets.findOne(db, { userId: session.userId, rulesetId: id }),
      StarredRulesets.count(db, { rulesetId: id }),
      Rulesets.exists(db, { subscribedTo: id }),
      Rulesets.findSources(db, { id }),
    ]);
    const hasExtensions = sources!.extensionIds.length > 0;

    const parent = ruleset.rulesetId ? await Rulesets.findOne(db, { id: ruleset.rulesetId }) : undefined;

    return {
      ...ruleset,
      rulesetName: parent?.name,
      isStarred: !!star,
      starCount,
      // A response says none with null: JSON leaves an undefined key out
      contributorRole: policy.contributorRole ?? null,
      isStarrable: isAllowed(() => policy.canStar()),
      permissions: this.permissionsOf(policy, { hasExtensions, usedAsExtension }),
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
      isStarrable: isStarrable(ruleset),
    }));

    return {
      ...rulesets,
      items,
    };
  }

  async updateRuleset(session: Session, id: string, body: RulesetUpdate) {
    // A published ruleset's kind change checks its content, on its view read fresh under its write's locks; anything
    // else locks its own row alone, as a write of its content locks it, and reads no view
    const stored = await Rulesets.findOne(db, { id });
    const checksContent = stored?.status === "Published" && body.kind !== undefined && body.kind !== stored.kind;
    if (checksContent) {
      return await withRulesetWrite(session, id, async (tx, scope, policy) =>
        this.applyUpdate(tx, session, { policy, ruleset: scope.ruleset, scope }, body),
      );
    }

    const result = await withLockedRuleset(session, id, async (tx, policy, ruleset) =>
      this.applyUpdate(tx, session, { policy, ruleset }, body),
    );
    RulesetViews.invalidate(id);
    return result;
  }
}

export default new RulesetsService();
