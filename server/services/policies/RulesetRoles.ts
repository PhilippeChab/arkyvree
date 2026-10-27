import type { ContributorRole } from "@/shared/enums.ts";
import type { Ruleset, Session } from "@/shared/relations.ts";

import BasePolicy from "./BasePolicy.ts";

/** Whether anyone may use `ruleset`: published, and not private. */
export function isPublicRuleset(ruleset: Ruleset) {
  return !ruleset.private && ruleset.status === "Published";
}

/**
 * Who the session is on a ruleset: its owner, a contributor with a role, a player in a campaign on it, or an editor of a
 * character built on it. What every ruleset check reads.
 */
export default abstract class RulesetRoles extends BasePolicy<Ruleset> {
  constructor(
    session: Pick<Session, "userId">,
    entity: Ruleset,
    contributorRole?: ContributorRole,
    isCampaignPlayer = false,
    isCharacterEditor = false,
  ) {
    super(session, entity);
    this.contributorRole = contributorRole;
    this.isCampaignPlayer = isCampaignPlayer;
    this.isCharacterEditor = isCharacterEditor;
  }

  /** Plays in a campaign on the ruleset: looked up only for a ruleset that isn't public, where it lets them in. */
  protected readonly isCampaignPlayer: boolean;

  /**
   * Edits a character built on the ruleset (owns it, or actively contributes to it): looked up only on a private
   * ruleset the session has no other standing on, where it lets them read it.
   */
  protected readonly isCharacterEditor: boolean;

  /** The session's active contributor role on the ruleset: none for its owner or anyone else. */
  readonly contributorRole: ContributorRole | undefined;

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
