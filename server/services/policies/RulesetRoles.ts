import type { ContributorRole } from "@/shared/enums.ts";
import type { Ruleset, Session } from "@/shared/relations.ts";

import BasePolicy from "./BasePolicy.ts";

/** Who the session is on a ruleset: its owner, or a contributor with a role. What every ruleset check reads. */
export default abstract class RulesetRoles extends BasePolicy<Ruleset> {
  protected readonly contributorRole: ContributorRole | null;

  constructor(session: Session, entity: Ruleset, contributorRole: ContributorRole | null = null) {
    super(session, entity);
    this.contributorRole = contributorRole;
  }

  protected get isOwner() {
    return this.entity.userId === this.session.userId;
  }

  protected get isAdminContributor() {
    return this.contributorRole === "Admin";
  }

  protected get isEditorContributor() {
    return this.contributorRole === "Editor";
  }

  protected get isContributor() {
    return this.contributorRole !== null;
  }
}
