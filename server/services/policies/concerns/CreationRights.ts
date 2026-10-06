import { ForbiddenError, UnprocessableEntityError } from "@/server/errors/index.ts";
import type { Constructor } from "@/server/mixins.ts";
import type RulesetRoles from "@/server/services/policies/RulesetRoles.ts";

/** Who may create a campaign or a character on a ruleset. */
export function CreationRights<B extends Constructor<RulesetRoles>>(Base: B) {
  abstract class WithCreationRights extends Base {
    /** Owner, active contributor, player in a campaign on the ruleset, or anyone on a public published ruleset. */
    canCreateCampaign() {
      return this.canCreateCharacter();
    }

    canCreateCharacter() {
      if (this.entity.kind === "extension" || this.entity.status === "Archived" || this.entity.deletedAt) {
        throw new UnprocessableEntityError("Choose an active playable ruleset");
      }

      if (!this.isPublic && !this.isOwner && !this.isContributor && !this.isCampaignPlayer) {
        throw new ForbiddenError("You do not have access to this ruleset");
      }

      return true;
    }
  }
  return WithCreationRights;
}
