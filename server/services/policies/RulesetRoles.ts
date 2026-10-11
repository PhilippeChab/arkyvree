import type { ContributorRole } from "@/shared/enums.ts";
import type { Ruleset, Session } from "@/shared/relations.ts";

import BasePolicy from "./BasePolicy.ts";

/** Whether anyone may use `ruleset`: published, and not private. */
export function isPublicRuleset(ruleset: Ruleset) {
  return !ruleset.private && ruleset.status === "Published";
}

/**
 * Who the session is on a ruleset: its owner, a contributor with a role, or a player in a campaign on it. What every
 * ruleset check reads.
 */
export default abstract class RulesetRoles extends BasePolicy<Ruleset> {
  constructor(
    session: Pick<Session, "userId">,
    entity: Ruleset,
    contributorRole?: ContributorRole,
    isCampaignPlayer = false,
  ) {
    super(session, entity);
    this.contributorRole = contributorRole;
    this.isCampaignPlayer = isCampaignPlayer;
  }

  protected readonly contributorRole: ContributorRole | undefined;

  /** Plays in a campaign on the ruleset: looked up only for a ruleset that isn't public, where it lets them in. */
  protected readonly isCampaignPlayer: boolean;

  protected get isAdminContributor() {
    return this.contributorRole === "Admin";
  }

  protected get isContributor() {
    return this.contributorRole !== undefined;
  }

  protected get isEditorContributor() {
    return this.contributorRole === "Editor";
  }

  protected get isOwner() {
    return this.entity.userId === this.session.userId;
  }

  protected get isPublic() {
    return isPublicRuleset(this.entity);
  }
}
