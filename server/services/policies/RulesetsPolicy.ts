import type { Db } from "@/server/database/index.ts";
import { ForbiddenError, UnprocessableEntityError } from "@/server/errors/index.ts";
import { include } from "@/server/mixins.ts";
import { Contributors } from "@/server/repositories/index.ts";
import type { Ruleset, Session } from "@/shared/relations.ts";

import { ContributorRights } from "./concerns/ContributorRights.ts";
import { CreationRights } from "./concerns/CreationRights.ts";
import { EntityRights } from "./concerns/EntityRights.ts";
import { ExtensionRights } from "./concerns/ExtensionRights.ts";
import RulesetRoles from "./RulesetRoles.ts";

class RulesetsPolicy extends include(RulesetRoles, ContributorRights, CreationRights, EntityRights, ExtensionRights) {
  /** The session's policy on `ruleset`: a contributor's rights come from their active role on it. */
  static async for(db: Db, session: Session, ruleset: Ruleset) {
    let role = null;
    if (ruleset.userId && ruleset.userId !== session.userId) {
      role = await Contributors.findRole(db, { userId: session.userId, rulesetId: ruleset.id });
    }
    return new RulesetsPolicy(session, ruleset, role);
  }

  canFork() {
    if (this.entity.status !== "Published") {
      throw new UnprocessableEntityError("Can only fork published rulesets");
    }

    // Only base rulesets can be forked. Anything with a parent (system
    // extensions, user forks, homebrew extensions) is rejected — the
    // descendant complexity (extension inheritance, COW resolution through
    // chains) isn't worth it for a use case nobody's asked for yet.
    if (this.entity.rulesetId) {
      throw new UnprocessableEntityError("Cannot fork a non-base ruleset — only base rulesets can be forked");
    }

    return true;
  }

  canPublish() {
    if (!this.entity.userId) {
      throw new ForbiddenError("Cannot publish a base ruleset");
    }

    if (this.entity.userId !== this.session.userId) {
      throw new ForbiddenError("Cannot publish another user's ruleset");
    }

    if (this.entity.status !== "Draft") {
      throw new UnprocessableEntityError("Can only publish draft rulesets");
    }

    return true;
  }

  canUnarchive() {
    if (!this.entity.userId) {
      throw new ForbiddenError("Cannot unarchive a base ruleset");
    }

    if (!this.isOwner) {
      throw new ForbiddenError("Cannot unarchive this ruleset");
    }

    if (this.entity.status !== "Archived") {
      throw new ForbiddenError("Ruleset is not archived");
    }

    return true;
  }

  /**
   * Used by RulesetsService for updating the ruleset itself (name, description, privacy, archive).
   * Only owner and Admin contributors are allowed.
   */
  canUpdate() {
    if (!this.entity.userId) {
      throw new ForbiddenError("Cannot edit a base ruleset");
    }

    if (!this.isOwner && !this.isAdminContributor) {
      throw new ForbiddenError("Cannot edit another user's ruleset");
    }

    if (this.entity.status === "Archived") {
      throw new UnprocessableEntityError("Archived rulesets are read-only");
    }

    return true;
  }

  canViewChanges() {
    // Public rulesets — anyone who can read the ruleset can see which
    // entities have been modified from the parent. Overrides are just
    // metadata about content that's already publicly visible.
    if (!this.entity.private) {
      return true;
    }

    if (!this.isOwner && !this.isContributor) {
      throw new ForbiddenError("Only the owner or contributors can view overrides");
    }

    return true;
  }
}

export default RulesetsPolicy;
