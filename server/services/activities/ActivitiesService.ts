import { EntityRepositories } from "@/server/cow/index.ts";
import { db } from "@/server/database/index.ts";
import {
  Activities,
  Campaigns,
  CharacterContributors,
  Characters,
  Contributors,
  Invites,
  Klasses,
  KlassLevels,
  Modifiers,
  PlayerCharacters,
  Players,
  Properties,
  Requirements,
  RULESET_ENTITY_TYPES,
  Rulesets,
  Visibility,
} from "@/server/repositories/index.ts";
import { isNavigableTarget } from "@/shared/activity.ts";
import { buildCustomizationPath, CUSTOMIZATION_PAGE_TYPES } from "@/shared/customization/entities.ts";
import { isOneOf } from "@/shared/isOneOf.ts";
import type { Session } from "@/shared/relations.ts";
import { getUrlSegment } from "@/shared/urlSegments.ts";

/** Where an activity links to: a page, nowhere (null), or a record the user no longer has access to. */
type ActivityUrl = string | null | { entityType: "ruleset" | "character"; noAccess: true };

/** A class's page, on its tab of `section` (its levels, skills, modifiers or requirements) when given. */
function classPageUrl(rulesetId: string, klassId: string, section?: string) {
  return `/rulesets/${rulesetId}/classes/${klassId}${section ? `/${section}` : ""}`;
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

  /** A class's section page (its levels, its skills), or null when the class is gone. */
  private async klassSectionUrl(klassId: string, section: "levels" | "skills") {
    const klass = await Klasses.findOne(db, { id: klassId });
    if (!klass) return null;
    return classPageUrl(klass.rulesetId, klass.id, section);
  }

  /**
   * The ruleset an owner of customizations is of: an entity's own, a class level's class's, a modifier's source's (a
   * requirement's owner can be a modifier); none for an owner outside a ruleset (a character's own modifiers).
   */
  private async ownerRulesetId(entityId: string, entityType: string): Promise<string | null> {
    if (entityType === "modifiers") {
      const modifier = await Modifiers.findOne(db, { id: entityId });
      // A modifier is an entity's (or a character's), never another modifier's: a row saying so leads nowhere
      if (!modifier || modifier.sourceType === "modifiers") return null;
      return await this.ownerRulesetId(modifier.sourceId, modifier.sourceType);
    }
    if (entityType === "klass_levels") {
      const klassLevel = await KlassLevels.findOne(db, { id: entityId });
      return klassLevel ? await this.ownerRulesetId(klassLevel.klassId, "klasses") : null;
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
   * The page that lists an owner's customizations: its customization page, or a class's page, on the tab of `section`
   * (its modifiers' or its requirements'; a property's, its details, its first).
   */
  private async resolveCustomizationUrl(
    entityId: string,
    entityType: string,
    section?: "modifiers" | "requirements",
  ): Promise<string | null> {
    const rulesetId = await this.ownerRulesetId(entityId, entityType);
    if (!rulesetId) return null;
    if (entityType === "klasses") return classPageUrl(rulesetId, entityId, section);
    if (!isOneOf(entityType, CUSTOMIZATION_PAGE_TYPES)) return null;
    return `/rulesets/${rulesetId}/${buildCustomizationPath(entityType, entityId)}${section ? `/${section}` : ""}`;
  }

  /** A ruleset entity's page, any type's: its customization page when it has one, else its own. */
  private async resolveRulesSubEntity(targetTable: string, targetId: string): Promise<string | null> {
    if (!isOneOf(targetTable, RULESET_ENTITY_TYPES)) return null;
    const entity = await EntityRepositories.of(targetTable).findOne(db, { id: targetId });
    if (!entity) return null;

    return isOneOf(targetTable, CUSTOMIZATION_PAGE_TYPES)
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

      // Class sub-entities
      case "klass_levels": {
        const klassLevel = await KlassLevels.findOne(db, { id: targetId });
        return klassLevel ? await this.klassSectionUrl(klassLevel.klassId, "levels") : null;
      }
      // targetId is klassId for klassSkills activities
      case "klass_skills":
        return await this.klassSectionUrl(targetId, "skills");

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
      case "properties": {
        const property = await Properties.findOne(db, { id: targetId });
        return property ? await this.resolveCustomizationUrl(property.entityId, property.entityType) : null;
      }

      // Rules sub-entities (entity has rulesetId)
      default:
        return await this.resolveRulesSubEntity(targetTable, targetId);
    }
  }
}

export default new ActivitiesService();
