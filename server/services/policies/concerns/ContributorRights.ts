import type { Constructor } from "@/lib/mixins.ts";
import { ConflictError, ForbiddenError } from "@/server/errors/index.ts";
import type RulesetRoles from "@/server/services/policies/RulesetRoles.ts";

/** Who may see and manage a ruleset's contributors. */
export function ContributorRights<B extends Constructor<RulesetRoles>>(Base: B) {
  abstract class WithContributorRights extends Base {
    /** Inviting a contributor: managing them (`canManageContributors`), on a ruleset that isn't archived. */
    canInviteContributors() {
      this.canManageContributors();

      if (this.entity.status === "Archived")
        throw new ConflictError("Cannot invite a contributor to an archived ruleset");

      return true;
    }

    /**
     * Owner-only narrowing of canManageContributors: invite/assign/revoke/change
     * role on an Admin contributor. An Admin contributor can manage other
     * Editor/Viewer contributors via canManageContributors but cannot touch
     * Admin-tier rows.
     */
    canManageAdminContributors() {
      if (!this.isOwner) throw new ForbiddenError("Only the owner can manage Admin contributors");

      return true;
    }

    canManageContributors() {
      if (!this.entity.userId) throw new ForbiddenError("Cannot manage contributors on a base ruleset");

      if (!this.isOwner && !this.isAdminContributor)
        throw new ForbiddenError("Only the owner or Admin contributors can manage contributors");

      return true;
    }

    canReadContributors() {
      if (!this.isOwner && !this.isContributor) throw new ForbiddenError("You are not a contributor of this ruleset");

      return true;
    }
  }
  return WithContributorRights;
}
