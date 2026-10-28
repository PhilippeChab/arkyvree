import { Engine } from "@/engine/index.ts";
import { db } from "@/server/database/index.ts";
import {
  Activities,
  CharacterContributors,
  Contributors,
  Invites,
  type Pagination,
  Players,
} from "@/server/repositories/index.ts";
import { findReadableCampaign, findVisibleCampaignCharacter } from "@/server/services/campaigns/index.ts";
import { findReadableCharacter } from "@/server/services/characters/index.ts";
import { findReadableRuleset } from "@/server/services/rulesets/index.ts";
import { isNavigableTarget } from "@/shared/activity.ts";
import { TARGET_TYPES } from "@/shared/activityTargets.ts";
import { buildEntityPagePath, hasCustomizationPage } from "@/shared/customization/entities.ts";
import type { Invite, Session } from "@/shared/relations.ts";

import { findContentOwner, findContentRuleset } from "./contentRuleset.ts";

/** Where an activity links to: a page, nowhere (null), or a record the user no longer has access to. */
type ActivityUrl = string | null | { entityType: "ruleset" | "character"; noAccess: true };

class ActivitiesService {
  /**
   * A contributor's link: its invitee goes to the invite while it's pending and has lost access once it's revoked or
   * rejected (signalled, so the caller can say so instead of 404'ing); anyone else, an active contributor or the
   * owner, goes to what it contributes to (`entityUrl`: none when they may not read it).
   */
  private contributorUrl(
    session: Session,
    contributor: { status: string; userId: string | null },
    entityType: "ruleset" | "character",
    inviteUrl: string,
    entityUrl: string | null,
  ): ActivityUrl {
    if (contributor.userId === session.userId) {
      if (contributor.status === "Pending") return inviteUrl;
      if (contributor.status !== "Active") return { noAccess: true, entityType };
    }
    return entityUrl;
  }

  /**
   * A campaign character's page, or null when it's in no campaign or the session may not see it
   * (`findVisibleCampaignCharacter`): a Private character's link isn't revealed to the campaign's other players.
   */
  private async campaignCharacterUrl(session: Session, characterId: string) {
    const found = await findVisibleCampaignCharacter(db, session, characterId);
    return found ? `/campaigns/${found.campaign.id}/characters/${characterId}` : null;
  }

  /**
   * A campaign's page, or null when it's gone or the session may not read it (`findReadableCampaign`): a campaign's
   * existence isn't revealed to whoever isn't in it, nor its players' and invites'.
   */
  private async campaignUrl(session: Session, campaignId: string) {
    return (await findReadableCampaign(db, session, campaignId)) ? `/campaigns/${campaignId}` : null;
  }

  /**
   * A character's page, archived or not, or null when it's gone or the session may not read it
   * (`findReadableCharacter`): a character's existence isn't revealed to whoever doesn't edit it (or a child's parent),
   * nor its levels', inventory's and contributors'.
   */
  private async characterUrl(session: Session, characterId: string) {
    return (await findReadableCharacter(db, session, characterId)) ? `/characters/${characterId}` : null;
  }

  /**
   * A campaign invite's link: its invitee goes to the invite until they've accepted it (its page answers a pending one
   * and says what became of the others), then to its campaign's page (`campaignUrl`), as anyone else does.
   */
  private async inviteUrl(session: Session, invite: Invite) {
    if (invite.userId === session.userId && invite.status !== "Accepted") return `/campaign-invite/${invite.id}`;
    return await this.playerCampaignUrl(session, invite.playerId);
  }

  /** The page of a player's campaign, or null when the player is gone (`campaignUrl`). */
  private async playerCampaignUrl(session: Session, playerId: string) {
    const player = await Players.findOne(db, { id: playerId });
    return player ? await this.campaignUrl(session, player.campaignId) : null;
  }

  /**
   * The page that lists an owner's customizations (`entityId`, `entityType`), on the tab of `section` (its modifiers'
   * or its requirements'): its customization page, or the page of a kind that owns another (a class's); none for an
   * owner outside a ruleset (a character's own modifiers).
   */
  private async resolveCustomizationUrl(
    session: Session,
    entityId: string,
    entityType: string,
    section: "modifiers" | "requirements",
  ): Promise<string | null> {
    const storage = Engine.storage();
    const pages = storage.customizationPages();
    if (!storage.ownerKinds().includes(entityType) && !hasCustomizationPage(entityType, pages)) return null;
    const rulesetId = await findContentRuleset(db, { id: entityId, type: entityType });
    if (!rulesetId || !(await this.rulesetUrl(session, rulesetId))) return null;
    return buildEntityPagePath(rulesetId, entityType, entityId, pages, section);
  }

  /**
   * A ruleset's content's page: an owned entity's owner's (a class level's class's); a link of a role an owner edits, the
   * owner's on the tab of its targets (a class's skills, whose activity targets the class); any other entity's, its
   * customization page when it has one, else its own.
   */
  private async resolveRulesEntity(session: Session, targetType: string, targetId: string): Promise<string | null> {
    const storage = Engine.storage();
    const target = { id: targetId, type: targetType };
    const edited = storage.editedLinks().get(targetType);
    // An owned entity and an edited link show on their owner's own page, as long as no kind that owns another or edits
    // its links has a customization page (3.5's classes: their customizations are their page's tabs)
    const page = storage.ownerOf(targetType) || edited ? await findContentOwner(db, target) : target;
    const rulesetId = page && (await findContentRuleset(db, page));
    if (!page || !rulesetId || !(await this.rulesetUrl(session, rulesetId))) return null;
    return buildEntityPagePath(rulesetId, page.type, page.id, storage.customizationPages(), edited?.to);
  }

  /**
   * A ruleset's page, or null when it's gone or the session may not read it (`findReadableRuleset`): a private
   * ruleset's existence isn't revealed, nor its content's, whose links ask it too.
   */
  private async rulesetUrl(session: Session, rulesetId: string) {
    return (await findReadableRuleset(db, session, rulesetId)) ? `/rulesets/${rulesetId}` : null;
  }

  async getActivities(
    session: Session,
    where: {
      orderBy?: "createdAt" | "type";
      orderDir?: "asc" | "desc";
      search?: string;
      targetType?: string;
      type?: string;
    },
    pagination: Pagination,
  ) {
    return await Activities.findPage(
      db,
      {
        userId: session.userId,
        ...where,
      },
      pagination,
    );
  }

  async getActivityUrl(session: Session, targetType: string, targetId: string): Promise<ActivityUrl> {
    if (!isNavigableTarget(targetType)) return null;
    switch (targetType) {
      // Top-level records link to their page, archived or not, until they're deleted
      case TARGET_TYPES.rulesets:
        return await this.rulesetUrl(session, targetId);
      case TARGET_TYPES.characters:
      // Character sub-entities: targetId is the characterId
      case TARGET_TYPES.advancements:
      case TARGET_TYPES.inventory:
        return await this.characterUrl(session, targetId);
      case TARGET_TYPES.campaigns:
        return await this.campaignUrl(session, targetId);

      // Campaign sub-entities
      case TARGET_TYPES.players:
        return await this.playerCampaignUrl(session, targetId);
      // targetId is the characterId
      case TARGET_TYPES.playerCharacters:
        return await this.campaignCharacterUrl(session, targetId);
      case TARGET_TYPES.invites: {
        const invite = await Invites.findOne(db, { id: targetId });
        return invite ? await this.inviteUrl(session, invite) : null;
      }

      case TARGET_TYPES.contributors: {
        const contributor = await Contributors.findOne(db, { id: targetId });
        if (!contributor) return null;
        const inviteUrl = `/ruleset-contributor-invite/${targetId}`;
        const rulesetUrl = await this.rulesetUrl(session, contributor.rulesetId);
        return this.contributorUrl(session, contributor, "ruleset", inviteUrl, rulesetUrl);
      }
      case TARGET_TYPES.characterContributors: {
        const contributor = await CharacterContributors.findOne(db, { id: targetId });
        if (!contributor) return null;
        const inviteUrl = `/character-contributor-invite/${targetId}`;
        const characterUrl = await this.characterUrl(session, contributor.characterId);
        return this.contributorUrl(session, contributor, "character", inviteUrl, characterUrl);
      }

      // Customization entities
      case TARGET_TYPES.modifiers:
      case TARGET_TYPES.requirements: {
        // What it belongs to, as the walk to its ruleset reads it: none for a modifier of a modifier
        const owner = await findContentOwner(db, { id: targetId, type: targetType });
        return owner ? await this.resolveCustomizationUrl(session, owner.id, owner.type, targetType) : null;
      }
      // Rules sub-entities (entity has rulesetId)
      default:
        return await this.resolveRulesEntity(session, targetType, targetId);
    }
  }
}

export default new ActivitiesService();
