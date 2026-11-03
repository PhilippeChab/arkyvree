import type { Constructor } from "@/lib/mixins.ts";
import { ConflictError, ForbiddenError, NotFoundError, UnprocessableEntityError } from "@/server/errors/index.ts";
import type RulesetRoles from "@/server/services/policies/RulesetRoles.ts";
import type { ContributorRole } from "@/shared/enums.ts";
import type { User } from "@/shared/relations.ts";

/** Who may see and manage a ruleset's contributors. */
export function ContributorRights<B extends Constructor<RulesetRoles>>(Base: B) {
  abstract class WithContributorRights extends Base {
    /**
     * Inviting a contributor: managing them (`canManageContributors`), and as an Admin (`role`), managing Admins
     * (`canManageAdminContributors`); a user (`invitee`, an account the address has) other than its owner, who
     * contributes as no one (a 422); on a ruleset that isn't archived.
     */
    canInviteContributors({ invitee, role }: { invitee?: Pick<User, "id">; role?: ContributorRole } = {}) {
      this.canManageContributors();

      if (role === "Admin") this.canManageAdminContributors();

      if (invitee && invitee.id === this.entity.userId)
        throw new UnprocessableEntityError("Cannot invite the ruleset owner as a contributor");

      this.checkUnarchived();

      return true;
    }

    /**
     * Leaving the ruleset: its active contributors' (`isContributor`); anyone else, its owner too, contributes as no one
     * and is answered as not found.
     */
    canLeave() {
      if (!this.isContributor) throw new NotFoundError("You are not a contributor of this ruleset");

      return true;
    }

    /**
     * The owner's narrowing of `canManageContributors`: inviting an Admin, making a contributor one, and changing or
     * revoking one. An Admin contributor manages Editors and Viewers, never another Admin.
     */
    canManageAdminContributors() {
      if (!this.isOwner) throw new ForbiddenError("Only the owner can manage Admin contributors");

      return true;
    }

    /**
     * Managing contributors, archived or not: the owner and Admins, on a ruleset that has an owner, but a demo's
     * (`canUseSignedUpFeatures`).
     */
    canManageContributors() {
      this.checkOwned("manage contributors on");

      if (!this.isOwner && !this.isAdminContributor)
        throw new ForbiddenError("Only the owner or Admin contributors can manage contributors");

      return this.canUseSignedUpFeatures();
    }

    canReadContributors() {
      if (!this.isOwner && !this.isContributor) throw new ForbiddenError("You are not a contributor of this ruleset");

      return true;
    }

    /**
     * Revoking a contributor of `role`: managing contributors, archived or not, and an Admin, managing Admins; one who
     * contributes or is invited (`status`), as neither a revoked nor a rejected one does.
     */
    canRevokeContributor({ role, status }: { role: ContributorRole; status: string }) {
      this.canManageContributors();

      if (role === "Admin") this.canManageAdminContributors();

      if (status !== "Active" && status !== "Pending") throw new ConflictError("Contributor is not active or pending");

      return true;
    }

    /**
     * Changing a contributor's role from `from` to `to`: managing contributors, and where either is Admin, managing
     * Admins (who, first), on a ruleset that isn't archived; an active contributor's (`status`), as an invite's is its
     * invite's.
     */
    canUpdateContributorRole({
      from,
      status,
      to,
    }: { from?: ContributorRole; status?: string; to?: ContributorRole } = {}) {
      this.canManageContributors();

      if (from === "Admin" || to === "Admin") this.canManageAdminContributors();

      this.checkUnarchived();

      if (status !== undefined && status !== "Active")
        throw new ConflictError("Can only update role of active contributors");

      return true;
    }
  }
  return WithContributorRights;
}
