import type { Db } from "@/server/database/index.ts";
import { ForbiddenError, UnprocessableEntityError } from "@/server/errors/index.ts";
import type { Constructor } from "@/server/mixins.ts";
import { Players } from "@/server/repositories/index.ts";
import type RulesetRoles from "@/server/services/policies/RulesetRoles.ts";

/** Who may create a campaign or a character on a ruleset. */
export function CreationRights<B extends Constructor<RulesetRoles>>(Base: B) {
  abstract class WithCreationRights extends Base {
    /**
     * Owner, active contributor, member of any campaign that uses this ruleset,
     * or any session against a public published ruleset. Async because the
     * campaign-membership branch is a DB lookup.
     */
    async canCreateCampaign(tx: Db) {
      return this.canCreateCharacter(tx);
    }

    async canCreateCharacter(tx: Db) {
      if (this.entity.kind === "extension" || this.entity.status === "Archived" || this.entity.deletedAt) {
        throw new UnprocessableEntityError("Choose an active playable ruleset");
      }

      const isPublic = !this.entity.private && this.entity.status === "Published";
      if (isPublic || this.isOwner || this.isContributor) {
        return true;
      }

      const campaignAccess = await Players.existsOnRuleset(tx, {
        userId: this.session.userId,
        rulesetId: this.entity.id,
      });

      if (!campaignAccess) {
        throw new ForbiddenError("You do not have access to this ruleset");
      }

      return true;
    }
  }
  return WithCreationRights;
}
