import { and, eq, isNull, sql } from "drizzle-orm";
import { campaignsInCampaign, playersInCampaign } from "@/drizzle/schema.ts";
import type { Db } from "@/server/database/index.ts";
import { ConflictError, ForbiddenError, UnprocessableEntityError } from "@/server/errors/index.ts";
import type { Ruleset, Session } from "@/shared/relations.ts";
import BasePolicy from "./BasePolicy.ts";

export type ContributorRole = "Admin" | "Editor" | "Viewer" | null;

export default class RulesetsPolicy extends BasePolicy<Ruleset> {
  private readonly contributorRole: ContributorRole;

  constructor(session: Session, entity: Ruleset, contributorRole: ContributorRole = null) {
    super(session, entity);
    this.contributorRole = contributorRole;
  }

  private get isOwner() {
    return this.entity.userId === this.session.userId;
  }

  private get isAdminContributor() {
    return this.contributorRole === "Admin";
  }

  private get isEditorContributor() {
    return this.contributorRole === "Editor";
  }

  private get isContributor() {
    return this.contributorRole !== null;
  }

  canCreate() {
    return true;
  }

  canRead() {
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

  /**
   * Used by entity services for creating/updating entities (feats, skills, etc.).
   * Owner, Admin, and Editor contributors are allowed.
   */
  canUpdateEntity() {
    if (!this.entity.userId) {
      throw new ForbiddenError("Cannot edit a base ruleset");
    }

    if (!this.isOwner && !this.isAdminContributor && !this.isEditorContributor) {
      throw new ForbiddenError("Cannot edit another user's ruleset");
    }

    if (this.entity.status === "Archived") {
      throw new UnprocessableEntityError("Archived rulesets are read-only");
    }

    return true;
  }

  canDelete() {
    return false;
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

  canSubscribeExtension() {
    if (!this.entity.userId) {
      throw new ForbiddenError("Cannot subscribe to extensions on a base ruleset");
    }

    if (this.entity.userId !== this.session.userId) {
      throw new ForbiddenError("Cannot subscribe to extensions on another user's ruleset");
    }

    if (this.entity.status === "Archived") {
      throw new UnprocessableEntityError("Cannot subscribe to extensions on an archived ruleset");
    }

    if (!this.entity.rulesetId) {
      throw new UnprocessableEntityError("Only forked rulesets can subscribe to extensions");
    }

    if (this.entity.kind === "extension") {
      throw new UnprocessableEntityError("Extensions cannot subscribe to other extensions");
    }

    return true;
  }

  canUnsubscribeExtension({ inUse = false }: { inUse?: boolean } = {}) {
    this.canSubscribeExtension();

    // An extension COWs base entities into its own ruleset and those COWs
    // may have sibling-winner ids characters have already picked. Removing
    // the extension silently invalidates those picks, so refuse the same
    // way `canDeleteEntity` does once the ruleset is being played.
    if (inUse) {
      throw new ConflictError("Cannot unsubscribe from extensions on a ruleset in use by characters");
    }

    return true;
  }

  /**
   * `inUse` means: deleting this entity would orphan a character pick on the
   * current ruleset, any descendant fork, or any host ruleset that subscribes
   * to this one as an extension. Nothing else.
   *
   * Don't include class-side references (klass_level_feats, klass_skills, etc.)
   * — class definitions are author-owned content; if the author deletes a feat
   * their class grants, the FK cascade wipes the grant and the author can fix
   * it. Class-granted feats that a character actually picked are recorded on
   * the character (level_feats_in_character.feat_id), so the character-side
   * check covers that case.
   *
   * The Character* repos' existsBy* methods take { id, rulesetId } and
   * internally join on rulesets to also count characters whose host ruleset
   * either descends from this ruleset (ancestor_ruleset_ids array overlap)
   * or subscribes to it as an extension (extension_ruleset_ids array overlap).
   * Don't include characters from sibling/parent rulesets — they're unrelated.
   *
   * Deletion is allowed on both Draft and Published rulesets — the inUse
   * check + COW tombstones already protect subscribers and characters.
   */
  canDeleteEntity({ inUse = false }: { inUse?: boolean } = {}) {
    if (!this.entity.userId) {
      throw new ForbiddenError("Cannot edit a base ruleset");
    }

    if (!this.isOwner && !this.isAdminContributor && !this.isEditorContributor) {
      throw new ForbiddenError("Cannot edit another user's ruleset");
    }

    if (this.entity.status === "Archived") {
      throw new UnprocessableEntityError("Archived rulesets are read-only");
    }

    if (inUse) {
      throw new ConflictError("Cannot delete entities from a ruleset in use by characters");
    }

    return true;
  }

  canManageContributors() {
    if (!this.entity.userId) {
      throw new ForbiddenError("Cannot manage contributors on a base ruleset");
    }

    if (!this.isOwner && !this.isAdminContributor) {
      throw new ForbiddenError("Only the owner or Admin contributors can manage contributors");
    }

    return true;
  }

  /**
   * Owner-only narrowing of canManageContributors: invite/assign/revoke/change
   * role on an Admin contributor. An Admin contributor can manage other
   * Editor/Viewer contributors via canManageContributors but cannot touch
   * Admin-tier rows.
   */
  canManageAdminContributors() {
    if (!this.isOwner) {
      throw new ForbiddenError("Only the owner can manage Admin contributors");
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

  /**
   * Owner, active contributor, member of any campaign that uses this ruleset,
   * or any session against a public published ruleset. Async because the
   * campaign-membership branch is a DB lookup.
   */
  async canCreateCharacter(tx: Db) {
    const isPublic = !this.entity.private && this.entity.status === "Published";
    if (isPublic || this.isOwner || this.isContributor) {
      return true;
    }

    const [campaignAccess] = await tx
      .select({ one: sql`1` })
      .from(playersInCampaign)
      .innerJoin(
        campaignsInCampaign,
        eq(playersInCampaign.campaignId, campaignsInCampaign.id),
      )
      .where(and(
        eq(playersInCampaign.userId, this.session.userId),
        isNull(playersInCampaign.deletedAt),
        isNull(campaignsInCampaign.deletedAt),
        eq(campaignsInCampaign.rulesetId, this.entity.id),
      ))
      .limit(1);

    if (!campaignAccess) {
      throw new ForbiddenError("You do not have access to this ruleset");
    }

    return true;
  }
}
