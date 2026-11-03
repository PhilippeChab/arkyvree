import { ConflictError, ForbiddenError } from "@/server/errors/index.ts";
import type { ContributorRole } from "@/shared/enums.ts";
import type { Ruleset, Session } from "@/shared/relations.ts";

import BasePolicy from "./BasePolicy.ts";

/** The session's standing on a ruleset beyond a contributor's role (`RulesetRoles`'s flags of the same names). */
export interface RulesetStanding {
  isCampaignMember?: boolean;
  isCampaignPlayer?: boolean;
  isCharacterEditor?: boolean;
}

/**
 * Whether `ruleset` is of a kind others build on, whatever its state: a base, which is forked, or an extension, which is
 * subscribed to. A fork for play is neither.
 */
export function isBuildable(ruleset: Pick<Ruleset, "kind" | "rulesetId">) {
  return !ruleset.rulesetId || ruleset.kind === "extension";
}

/** Whether anyone may use `ruleset`: published, and not private. */
export function isPublicRuleset(ruleset: Pick<Ruleset, "private" | "status">) {
  return !ruleset.private && ruleset.status === "Published";
}

/** Whether `ruleset` may be starred, a bookmark on what can be built on (`isBuildable`), once it's public. */
export function isStarrable(ruleset: Pick<Ruleset, "kind" | "private" | "rulesetId" | "status">) {
  return isPublicRuleset(ruleset) && isBuildable(ruleset);
}

/**
 * Who the session is on a ruleset: its owner, a contributor with a role, a player in a campaign on it (a member of one,
 * archived or not), or an editor of a character built on it. What every ruleset check reads.
 */
export default abstract class RulesetRoles extends BasePolicy<Ruleset> {
  constructor(
    session: Session,
    entity: Ruleset,
    contributorRole?: ContributorRole,
    { isCampaignPlayer = false, isCampaignMember = isCampaignPlayer, isCharacterEditor = false }: RulesetStanding = {},
  ) {
    super(session, entity);
    this.contributorRole = contributorRole;
    this.isCampaignMember = isCampaignMember;
    this.isCampaignPlayer = isCampaignPlayer;
    this.isCharacterEditor = isCharacterEditor;
  }

  /**
   * Has a live seat in a campaign on the ruleset, the campaign archived or not (who may read the campaign):
   * looked up only for a ruleset that isn't public, where it lets them read it.
   */
  protected readonly isCampaignMember: boolean;

  /**
   * Plays in a live campaign on the ruleset, from a live seat: looked up only for a ruleset that isn't public, where it
   * lets them create on it.
   */
  protected readonly isCampaignPlayer: boolean;

  /**
   * Edits a character built on the ruleset (owns it, or actively contributes to it): looked up only on a private
   * ruleset the session has no other standing on, where it lets them read it.
   */
  protected readonly isCharacterEditor: boolean;

  /** The session's active contributor role on the ruleset: none for its owner or anyone else. */
  readonly contributorRole: ContributorRole | undefined;

  /**
   * Refuses changing a ruleset nobody owns (`what`: the change, "edit", "publish"…), whoever asks. A system ruleset is
   * its seeders'. An orphaned one (its owner's account deleted, `Rulesets.orphan`) is frozen as its owner left it: with
   * nobody to manage its Admins, unarchive it or publish it, its contributors keep reading it and may leave, but
   * change nothing.
   */
  protected checkOwned(what: string) {
    if (this.entity.userId !== null) return;

    throw new ForbiddenError(`Cannot ${what} ${this.entity.system ? "a base ruleset" : "a ruleset without an owner"}`);
  }

  /**
   * Refuses a change to an archived ruleset, which is read-only, on its state (a 409), in one wording whatever is asked
   * of it: an edit (its own, its archive, an entity's, a revert), a subscribe or an unsubscribe, a contributor's invite
   * or role change, an invite's accept.
   */
  protected checkUnarchived() {
    if (this.entity.status === "Archived") throw new ConflictError("This ruleset is archived");
  }

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
