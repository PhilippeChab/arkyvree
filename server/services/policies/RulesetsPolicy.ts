import type { Db } from "@/drizzle/database.ts";
import { include } from "@/lib/mixins.ts";
import { ConflictError, ForbiddenError, NotFoundError, UnprocessableEntityError } from "@/server/errors/index.ts";
import { Characters, Contributors, Players } from "@/server/repositories/index.ts";
import type { RulesetKind } from "@/shared/enums.ts";
import type { Ruleset, Session } from "@/shared/relations.ts";

import { ContributorRights } from "./concerns/ContributorRights.ts";
import { CreationRights } from "./concerns/CreationRights.ts";
import { EntityRights } from "./concerns/EntityRights.ts";
import { ExtensionRights } from "./concerns/ExtensionRights.ts";
import RulesetRoles, { isBuildable, isPublicRuleset } from "./RulesetRoles.ts";

/**
 * The kind a write would give the ruleset (`kind`, its own when unchanged), and what its kind check reads, as the write
 * read it: whether it subscribes to extensions (`hasExtensions`), and whether another ruleset subscribes to it
 * (`usedAsExtension`).
 */
interface KindFacts {
  hasExtensions: boolean;
  kind: RulesetKind;
  usedAsExtension: boolean;
}

class RulesetsPolicy extends include(RulesetRoles, ContributorRights, CreationRights, EntityRights, ExtensionRights) {
  /** The session's policy on `ruleset`, as `forMany` builds a page's. */
  static async for(db: Db, session: Session, ruleset: Ruleset) {
    return (await RulesetsPolicy.forMany(db, session, [ruleset])).get(ruleset.id)!;
  }

  /**
   * The session's policies on a page of rulesets (`rulesets`), by id, each standing read once for the page: a
   * contributor's rights come from their active role on it, a campaign member's from their live seat in a campaign on
   * it (in any campaign to read it, in a live one to create on it), which matters only on a ruleset that isn't public,
   * and a character's editor's from a character built on it, which matters only on a private ruleset they have no other
   * standing on (it lets them read it). A system ruleset has no contributors; an orphaned one (its owner's account
   * deleted) keeps its own.
   */
  static async forMany(db: Db, session: Session, rulesets: Ruleset[]) {
    const { userId } = session;
    const others = rulesets.filter((ruleset) => ruleset.userId !== userId);
    const contributions = await Contributors.findMany(db, {
      rulesetIds: others.filter((ruleset) => !ruleset.system).map(({ id }) => id),
      status: "Active",
      userId,
    });
    const roles = new Map(contributions.map(({ role, rulesetId }) => [rulesetId, role]));
    // Who has no role on a ruleset that isn't public: what a seat or a character gives them there
    const outsiders = others.filter((ruleset) => !roles.has(ruleset.id) && !isPublicRuleset(ruleset));
    const seats = await Players.findSeatPerRuleset(db, { rulesetIds: outsiders.map(({ id }) => id), userId });
    const unseated = outsiders.filter((ruleset) => !seats.has(ruleset.id) && ruleset.private);
    const edited = new Set(
      await Characters.findRulesetIds(db, { editorId: userId, rulesetIds: unseated.map(({ id }) => id) }),
    );
    return new Map(
      rulesets.map((ruleset) => {
        const standing = {
          isCampaignMember: seats.has(ruleset.id),
          isCampaignPlayer: seats.get(ruleset.id)?.live ?? false,
          isCharacterEditor: edited.has(ruleset.id),
        };
        return [ruleset.id, new RulesetsPolicy(session, ruleset, roles.get(ruleset.id), standing)];
      }),
    );
  }

  /**
   * Accepting an invite (`invite`) to contribute to the ruleset: a pending one (`canAnswerInvite`), to one that isn't
   * archived (`checkUnarchived`).
   */
  canAcceptInvite(invite: { status: string }) {
    this.canAnswerInvite(invite);
    this.checkUnarchived();

    return true;
  }

  canFork() {
    // Only base rulesets can be forked, whatever their state. Anything with a parent (system
    // extensions, user forks, homebrew extensions) is rejected — the
    // descendant complexity (extension inheritance, COW resolution through
    // chains) isn't worth it for a use case nobody's asked for yet.
    if (this.entity.rulesetId)
      throw new UnprocessableEntityError("Cannot fork a non-base ruleset — only base rulesets can be forked");

    if (this.entity.status !== "Published") throw new ConflictError("Can only fork published rulesets");

    return true;
  }

  /**
   * Publishing the ruleset as `kind` (`facts`: its own kind, for its `permissions`' whether it may be published as it
   * is): its owner's, but a demo's; as a kind it may take (`canTakeKind`, a 422); while it's a draft (a 409): who, then
   * its kind, then its state.
   */
  canPublish(facts: KindFacts) {
    this.checkOwned("publish");

    if (this.entity.userId !== this.session.userId) throw new ForbiddenError("Cannot publish another user's ruleset");

    this.canUseSignedUpFeatures();

    this.canTakeKind(facts);

    if (this.entity.status !== "Draft") throw new ConflictError("Can only publish draft rulesets");

    return true;
  }

  /**
   * Reading the ruleset and what's under it by its id (its entities, customizations, settings, extensions, changes):
   * `isReadable`. Anyone else gets the 404 an unknown ruleset gets, so a private ruleset's existence isn't revealed.
   */
  canRead() {
    if (!this.isReadable()) throw new NotFoundError("Ruleset not found");

    return true;
  }

  /**
   * Reverting the ruleset's copy of an inherited entity to its parent's: who edits its entities, a fork's alone, whose
   * changes these are (`canViewChanges`, a 422 for a base), while it isn't archived: who, then its kind, then its
   * state.
   */
  canRevertChange() {
    this.checkEntityEditor();
    this.canViewChanges();
    this.checkUnarchived();

    return true;
  }

  /**
   * Starring the ruleset (`isStarrable`): one that can be built on, a base or an extension (`isBuildable`: a fork for
   * play never is), once it's public (`isPublicRuleset`).
   */
  canStar() {
    if (!isBuildable(this.entity))
      throw new UnprocessableEntityError("Only base rulesets and extensions can be starred");

    if (!isPublicRuleset(this.entity)) throw new ConflictError("Only public published rulesets can be starred");

    return true;
  }

  /**
   * The ruleset taking kind `kind` (`facts`, as its write read them: its own kind too, which a publish checks again), by
   * a publish or an edit, whoever asks: a change of kind `canChangeKind` allows, and an extension `canBeExtension` allows
   * (each a 422). Who may publish or edit it is `canPublish`'s and `canUpdate`'s, which ask it after who and before its
   * state. Its `permissions` answer it for each kind (`kinds`), which its publish and its edit offer.
   */
  canTakeKind({ hasExtensions, kind, usedAsExtension }: KindFacts) {
    if (kind !== this.entity.kind) this.canChangeKind({ usedAsExtension });

    if (kind === "extension") this.canBeExtension({ hasExtensions });

    return true;
  }

  canUnarchive() {
    this.checkOwned("unarchive");

    if (!this.isOwner) throw new ForbiddenError("Cannot unarchive this ruleset");

    if (this.entity.status !== "Archived") throw new ConflictError("Ruleset is not archived");

    return true;
  }

  /**
   * Used by RulesetsService for updating the ruleset itself (name, description, privacy, archive).
   * Only owner and Admin contributors are allowed, as a kind it may take (`values.kind`: the kind an update names, and
   * what its check read, `canTakeKind`), and a public ruleset stays public (`values.private`: the privacy an update asks
   * for).
   */
  canUpdate(values: { kind?: KindFacts; private?: boolean } = {}) {
    this.checkOwned("edit");

    if (!this.isOwner && !this.isAdminContributor) throw new ForbiddenError("Cannot edit another user's ruleset");

    // The kind it's left in, checked before its state (a 422 before a 409), as its publish checks it
    if (values.kind) this.canTakeKind(values.kind);

    this.checkUnarchived();

    if (!this.entity.private && values.private) throw new ConflictError("Cannot make a public ruleset private");

    return true;
  }

  /**
   * Viewing the ruleset's changes to what it inherits: anyone who reads a public one (they're metadata about content
   * already visible), a private one's owner and contributors; a fork's alone, as a base inherits nothing (a 422 on its
   * kind, whatever its state).
   */
  canViewChanges() {
    if (this.entity.private && !this.isOwner && !this.isContributor)
      throw new ForbiddenError("Only the owner or contributors can view overrides");

    if (!this.entity.rulesetId) throw new UnprocessableEntityError("Only forked rulesets have local changes");

    return true;
  }

  /**
   * Whether the session may read the ruleset: anyone, one that isn't private; a private one, its owner, an active
   * contributor, a member of a campaign on it (archived or not), and an editor of a character built on it.
   */
  isReadable() {
    if (!this.entity.private) return true;

    return this.isOwner || this.isContributor || this.isCampaignMember || this.isCharacterEditor;
  }
}

export default RulesetsPolicy;
