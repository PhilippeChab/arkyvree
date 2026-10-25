import type { OwnedKind } from "@/engine/index.ts";
import { EntityRepositories } from "@/server/cow/index.ts";
import { db } from "@/server/database/index.ts";
import {
  Activities,
  Campaigns,
  CharacterContributors,
  Characters,
  Contributors,
  CUSTOMIZABLE_TYPES,
  EDITED_JOINS,
  Entities,
  Invites,
  Modifiers,
  OWNED_TYPES,
  PlayerCharacters,
  Players,
  Requirements,
  RULESET_ENTITY_TYPES,
  Rulesets,
  Visibility,
} from "@/server/repositories/index.ts";
import { isNavigableTarget } from "@/shared/activity.ts";
import { buildCustomizationPath } from "@/shared/customization/entities.ts";
import { isOneOf } from "@/shared/isOneOf.ts";
import type { Session } from "@/shared/relations.ts";
import { getUrlSegment } from "@/shared/urlSegments.ts";

/** Where an activity links to: a page, nowhere (null), or a record the user no longer has access to. */
type ActivityUrl = string | null | { entityType: "ruleset" | "character"; noAccess: true };

/**
 * An entity's page (`entityType`, `entityId`: a class's), on its tab of `section` (its skills, modifiers or
 * requirements) when given, else its first.
 */
function entityPageUrl(rulesetId: string, entityType: string, entityId: string, section?: string) {
  return `/rulesets/${rulesetId}/${getUrlSegment(entityType)}/${entityId}${section ? `/${section}` : ""}`;
}

/**
 * Whether a kind's customizations have a page of their own: a customizable kind's, but those of a kind that owns
 * another (a class's), which are tabs of its own page; and a modifier's (its requirements).
 */
function hasCustomizationPage(entityType: string) {
  if (entityType === "modifiers") return true;
  return CUSTOMIZABLE_TYPES.includes(entityType) && !isOneOf(entityType, [...OWNED_TYPES.values()]);
}

class ActivitiesService {
  /**
   * A contributor's link: its invitee goes to the invite while it's pending and has lost access once it's revoked or
   * rejected (signalled, so the caller can say so instead of 404'ing); anyone else, an active contributor or the
   * owner, goes to what it contributes to.
   */
  private contributorUrl(
    session: Session,
    contributor: { status: string; userId: string | null },
    entityType: "ruleset" | "character",
    inviteUrl: string,
    entityUrl: string,
  ): ActivityUrl {
    if (contributor.userId === session.userId) {
      if (contributor.status === "Pending") return inviteUrl;
      if (contributor.status !== "Active") return { noAccess: true, entityType };
    }
    return entityUrl;
  }

  /**
   * The page of an owner of other entities (`ownerType`, `ownerId`: a class), on the tab of `section` (its skills) when
   * given, else its first: null when the owner is gone.
   */
  private async ownerPageUrl(ownerType: string, ownerId: string, section?: string) {
    const owner = await Entities.findOne(db, { entityType: ownerType, id: ownerId });
    if (!owner) return null;
    return entityPageUrl(String(owner.rulesetId), ownerType, owner.id, section);
  }

  /**
   * The ruleset an owner of customizations is of: an entity's own, an owned one's owner's (a class level's class's), a
   * modifier's source's (a requirement's owner can be a modifier); none for an owner outside a ruleset (a character's own
   * modifiers).
   */
  private async ownerRulesetId(entityId: string, entityType: string): Promise<string | null> {
    if (entityType === "modifiers") {
      const modifier = await Modifiers.findOne(db, { id: entityId });
      // A modifier is an entity's (or a character's), never another modifier's: a row saying so leads nowhere
      if (!modifier || modifier.sourceType === "modifiers") return null;
      return await this.ownerRulesetId(modifier.sourceId, modifier.sourceType);
    }
    const ownerType = OWNED_TYPES.get(entityType as OwnedKind);
    if (ownerType) {
      const [owned] = await Entities.findPositions(db, { entityType, ids: [entityId] });
      return owned ? await this.ownerRulesetId(owned.ownerId, ownerType) : null;
    }
    if (!isOneOf(entityType, RULESET_ENTITY_TYPES)) return null;
    return (await EntityRepositories.of(entityType).findOne(db, { id: entityId }))?.rulesetId ?? null;
  }

  /** The page of a player's campaign (`path` under it), or null when the player is gone. */
  private async playerCampaignUrl(playerId: string, path = "") {
    const player = await Players.findOne(db, { id: playerId });
    if (!player) return null;
    return `/campaigns/${player.campaignId}${path}`;
  }

  /**
   * The page that lists an owner's customizations: its customization page, or the page of a kind that owns another (a
   * class's), on the tab of `section` (its modifiers' or its requirements'; without one, its details, its first).
   */
  private async resolveCustomizationUrl(
    entityId: string,
    entityType: string,
    section?: "modifiers" | "requirements",
  ): Promise<string | null> {
    const rulesetId = await this.ownerRulesetId(entityId, entityType);
    if (!rulesetId) return null;
    if (isOneOf(entityType, [...OWNED_TYPES.values()])) return entityPageUrl(rulesetId, entityType, entityId, section);
    if (!hasCustomizationPage(entityType)) return null;
    return `/rulesets/${rulesetId}/${buildCustomizationPath(entityType, entityId)}${section ? `/${section}` : ""}`;
  }

  /**
   * A ruleset's content's page: an owned entity's owner's (a class level's class's); a join's an owner edits, the owner's
   * on the tab of the join's targets (a class's skills, whose activity targets the class); any other entity's, its
   * customization page when it has one, else its own.
   */
  private async resolveRulesEntity(targetTable: string, targetId: string): Promise<string | null> {
    const ownerType = OWNED_TYPES.get(targetTable as OwnedKind);
    if (ownerType) {
      const [owned] = await Entities.findPositions(db, { entityType: targetTable, ids: [targetId] });
      return owned ? await this.ownerPageUrl(ownerType, owned.ownerId) : null;
    }
    const join = EDITED_JOINS.get(targetTable);
    if (join) return await this.ownerPageUrl(join.from, targetId, getUrlSegment(join.to));
    return await this.resolveRulesSubEntity(targetTable, targetId);
  }

  /** A ruleset entity's page, any type's: its customization page when it has one, else its own. */
  private async resolveRulesSubEntity(targetTable: string, targetId: string): Promise<string | null> {
    if (!isOneOf(targetTable, RULESET_ENTITY_TYPES)) return null;
    const entity = await EntityRepositories.of(targetTable).findOne(db, { id: targetId });
    if (!entity) return null;

    return hasCustomizationPage(targetTable)
      ? `/rulesets/${entity.rulesetId}/${buildCustomizationPath(targetTable, targetId)}`
      : `/rulesets/${entity.rulesetId}/${getUrlSegment(targetTable)}/${targetId}`;
  }

  async getActivities(
    session: Session,
    where: {
      orderBy?: "createdAt" | "type";
      orderDir?: "asc" | "desc";
      search?: string;
      targetTable?: string;
      type?: string;
    },
    pagination: { limit: number; page: number },
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

  async getActivityUrl(session: Session, targetTable: string, targetId: string): Promise<ActivityUrl> {
    if (!isNavigableTarget(targetTable)) return null;
    switch (targetTable) {
      // Top-level records link to their page, archived or not, until they're deleted
      case "rulesets":
        return (await Rulesets.findOne(db, { id: targetId }, Visibility.All)) ? `/rulesets/${targetId}` : null;
      case "characters":
      // Character sub-entities: targetId is the characterId
      case "inventory":
      case "levels":
        return (await Characters.findOne(db, { id: targetId }, Visibility.All)) ? `/characters/${targetId}` : null;
      case "campaigns":
        return (await Campaigns.findOne(db, { id: targetId }, Visibility.All)) ? `/campaigns/${targetId}` : null;

      // Campaign sub-entities
      case "players":
        return await this.playerCampaignUrl(targetId);
      // targetId is the characterId; a character is linked to one campaign at a time.
      case "player_characters": {
        const link = await PlayerCharacters.findOne(db, { characterId: targetId });
        return link ? await this.playerCampaignUrl(link.playerId, `/characters/${targetId}`) : null;
      }
      case "invites": {
        const invite = await Invites.findOne(db, { id: targetId });
        return invite ? await this.playerCampaignUrl(invite.playerId) : null;
      }

      case "contributors": {
        const contributor = await Contributors.findOne(db, { id: targetId });
        if (!contributor) return null;
        const inviteUrl = `/ruleset-contributor-invite/${targetId}`;
        return this.contributorUrl(session, contributor, "ruleset", inviteUrl, `/rulesets/${contributor.rulesetId}`);
      }
      case "character_contributors": {
        const contributor = await CharacterContributors.findOne(db, { id: targetId });
        if (!contributor) return null;
        const inviteUrl = `/character-contributor-invite/${targetId}`;
        const characterUrl = `/characters/${contributor.characterId}`;
        return this.contributorUrl(session, contributor, "character", inviteUrl, characterUrl);
      }

      // Customization entities
      case "modifiers": {
        const modifier = await Modifiers.findOne(db, { id: targetId });
        return modifier
          ? await this.resolveCustomizationUrl(modifier.sourceId, modifier.sourceType, "modifiers")
          : null;
      }
      case "requirements": {
        const requirement = await Requirements.findOne(db, { id: targetId });
        return requirement
          ? await this.resolveCustomizationUrl(requirement.entityId, requirement.entityType, "requirements")
          : null;
      }
      // Rules sub-entities (entity has rulesetId)
      default:
        return await this.resolveRulesEntity(targetTable, targetId);
    }
  }
}

export default new ActivitiesService();
