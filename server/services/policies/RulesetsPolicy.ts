import type { Db } from "@/drizzle/database.ts";
import { include } from "@/lib/mixins.ts";
import { ConflictError, ForbiddenError, NotFoundError, UnprocessableEntityError } from "@/server/errors/index.ts";
import { Characters, Contributors, Players } from "@/server/repositories/index.ts";
import type { Ruleset, Session } from "@/shared/relations.ts";

import { ContributorRights } from "./concerns/ContributorRights.ts";
import { CreationRights } from "./concerns/CreationRights.ts";
import { EntityRights } from "./concerns/EntityRights.ts";
import { ExtensionRights } from "./concerns/ExtensionRights.ts";
import RulesetRoles, { isPublicRuleset, isStarrable } from "./RulesetRoles.ts";

class RulesetsPolicy extends include(RulesetRoles, ContributorRights, CreationRights, EntityRights, ExtensionRights) {
  /**
   * The session's policy on `ruleset`: a contributor's rights come from their active role on it, a campaign member's
   * from their live seat in a campaign on it (in any campaign to read it, in a live one to create on it), which
   * matters only on a ruleset that isn't public, and a character's editor's from a character built on it, which
   * matters only on a private ruleset they have no other standing on (it lets them read it). A system ruleset has no
   * contributors; an orphaned one (its owner's account deleted) keeps its own.
   */
  static async for(db: Db, session: Session, ruleset: Ruleset) {
    const isOwner = ruleset.userId === session.userId;
    const role =
      !ruleset.system && !isOwner
        ? await Contributors.findRole(db, { userId: session.userId, rulesetId: ruleset.id })
        : undefined;
    const seat =
      !isOwner && role === undefined && !isPublicRuleset(ruleset)
        ? await Players.findSeat(db, { userId: session.userId, rulesetId: ruleset.id })
        : undefined;
    const isCharacterEditor =
      !isOwner &&
      role === undefined &&
      !seat &&
      ruleset.private &&
      (await Characters.exists(db, { editorId: session.userId, rulesetId: ruleset.id }));
    return new RulesetsPolicy(session, ruleset, role, {
      isCampaignMember: Boolean(seat),
      isCampaignPlayer: seat?.live ?? false,
      isCharacterEditor,
    });
  }

  /** Accepting an invite to contribute to the ruleset: one that isn't archived. */
  canAcceptInvite() {
    if (this.entity.status === "Archived") throw new ConflictError("This ruleset has been archived");

    return true;
  }

  canFork() {
    if (this.entity.status !== "Published") throw new UnprocessableEntityError("Can only fork published rulesets");

    // Only base rulesets can be forked. Anything with a parent (system
    // extensions, user forks, homebrew extensions) is rejected — the
    // descendant complexity (extension inheritance, COW resolution through
    // chains) isn't worth it for a use case nobody's asked for yet.
    if (this.entity.rulesetId)
      throw new UnprocessableEntityError("Cannot fork a non-base ruleset — only base rulesets can be forked");

    return true;
  }

  canPublish() {
    this.checkOwned("publish");

    if (this.entity.userId !== this.session.userId) throw new ForbiddenError("Cannot publish another user's ruleset");

    if (this.entity.status !== "Draft") throw new UnprocessableEntityError("Can only publish draft rulesets");

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

  /** Starring the ruleset: one that can be built on (`isStarrable`), a public base or extension. */
  canStar() {
    if (!isStarrable(this.entity)) throw new ForbiddenError("Only base rulesets and extensions can be starred");

    return true;
  }

  canUnarchive() {
    this.checkOwned("unarchive");

    if (!this.isOwner) throw new ForbiddenError("Cannot unarchive this ruleset");

    if (this.entity.status !== "Archived") throw new ForbiddenError("Ruleset is not archived");

    return true;
  }

  /**
   * Used by RulesetsService for updating the ruleset itself (name, description, privacy, archive).
   * Only owner and Admin contributors are allowed, and a public ruleset stays public (`values.private`: the privacy an
   * update asks for).
   */
  canUpdate(values: { private?: boolean } = {}) {
    this.checkOwned("edit");

    if (!this.isOwner && !this.isAdminContributor) throw new ForbiddenError("Cannot edit another user's ruleset");

    if (this.entity.status === "Archived") throw new UnprocessableEntityError("Archived rulesets are read-only");

    if (!this.entity.private && values.private) throw new ForbiddenError("Cannot make a public ruleset private");

    return true;
  }

  canViewChanges() {
    // Public rulesets — anyone who can read the ruleset can see which
    // entities have been modified from the parent. Overrides are just
    // metadata about content that's already publicly visible.
    if (!this.entity.private) return true;

    if (!this.isOwner && !this.isContributor)
      throw new ForbiddenError("Only the owner or contributors can view overrides");

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
