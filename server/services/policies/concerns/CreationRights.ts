import type { Constructor } from "@/lib/mixins.ts";
import { ForbiddenError, UnprocessableEntityError } from "@/server/errors/index.ts";
import type RulesetRoles from "@/server/services/policies/RulesetRoles.ts";

/** Who may create a campaign or a character on a ruleset. */
export function CreationRights<B extends Constructor<RulesetRoles>>(Base: B) {
  abstract class WithCreationRights extends Base {
    /** Owner, active contributor, player in a campaign on the ruleset, or anyone on a public published ruleset. */
    canCreateCampaign() {
      return this.canCreateCharacter();
    }

    /**
     * Creating a character (or a campaign, `canCreateCampaign`) on the ruleset: who may (its owner, an active
     * contributor, a player in a campaign on it, anyone on a public one past its draft: published, or archived since,
     * whose refusal is its state's) first, then a ruleset it can be created on, as another record the request names (a
     * 422: an extension, or an archived ruleset).
     */
    canCreateCharacter() {
      const isOpen = !this.entity.private && this.entity.status !== "Draft";
      if (!isOpen && !this.isOwner && !this.isContributor && !this.isCampaignPlayer)
        throw new ForbiddenError("You do not have access to this ruleset");

      if (this.entity.kind === "extension" || this.entity.status === "Archived")
        throw new UnprocessableEntityError("Choose an active playable ruleset");

      return true;
    }
  }
  return WithCreationRights;
}
