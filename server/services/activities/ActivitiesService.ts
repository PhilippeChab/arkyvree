import { db } from "@/server/database/index.ts";
import { Visibility } from "@/server/repositories/BaseRepository.ts";
import {
  Activities,
  Aptitudes,
  Campaigns,
  CharacterContributors,
  Characters,
  Contributors,
  Feats,
  Invites,
  Items,
  Klasses,
  KlassLevels,
  Languages,
  Modifiers,
  PlayerCharacters,
  Players,
  Powers,
  Properties,
  Races,
  Requirements,
  Rulesets,
  Saves,
  Skills,
} from "@/server/repositories/index.ts";
import type { Session } from "@/shared/relations.ts";

const CUSTOMIZATION_ENTITIES = new Set(["feats", "powers", "items", "races"]);

/** Where an activity links to: a page, nowhere (null), or a record the user no longer has access to. */
type ActivityUrl = string | null | { noAccess: true; entityType: "ruleset" | "character" };

class ActivitiesService {
  private async resolveCustomizationUrl(entityId: string, entityType: string): Promise<string | null> {
    if (entityType === "klass_levels") {
      const klassLevel = await KlassLevels.findOne(db, { id: entityId });
      if (!klassLevel) return null;
      const klass = await Klasses.findOne(db, { id: klassLevel.klassId });
      if (!klass) return null;
      return `/rulesets/${klass.rulesetId}/${entityType}/${entityId}/customization`;
    }

    const repoMap: Record<string, (id: string) => Promise<{ rulesetId: string } | undefined>> = {
      feats: (id) => Feats.findOne(db, { id }),
      powers: (id) => Powers.findOne(db, { id }),
      items: (id) => Items.findOne(db, { id }),
      races: (id) => Races.findOne(db, { id }),
    };

    const findOne = repoMap[entityType];
    if (!findOne) return null;
    const entity = await findOne(entityId);
    if (!entity) return null;
    return `/rulesets/${entity.rulesetId}/${entityType}/${entityId}/customization`;
  }

  private async resolveRulesSubEntity(targetTable: string, targetId: string): Promise<string | null> {
    const sectionMap: Record<string, [string, (id: string) => Promise<{ rulesetId: string } | undefined>]> = {
      feats: ["feats", (id) => Feats.findOne(db, { id })],
      powers: ["powers", (id) => Powers.findOne(db, { id })],
      skills: ["skills", (id) => Skills.findOne(db, { id })],
      races: ["races", (id) => Races.findOne(db, { id })],
      klasses: ["classes", (id) => Klasses.findOne(db, { id })],
      items: ["items", (id) => Items.findOne(db, { id })],
      saves: ["saves", (id) => Saves.findOne(db, { id })],
      languages: ["languages", (id) => Languages.findOne(db, { id })],
      aptitudes: ["aptitudes", (id) => Aptitudes.findOne(db, { id })],
    };

    const entry = sectionMap[targetTable];
    if (!entry) return null;

    const [section, findOne] = entry;
    const entity = await findOne(targetId);
    if (!entity) return null;

    if (CUSTOMIZATION_ENTITIES.has(targetTable)) {
      return `/rulesets/${entity.rulesetId}/${section}/${targetId}/customization`;
    }
    return `/rulesets/${entity.rulesetId}/${section}/${targetId}`;
  }

  /**
   * A contributor's link: its invitee goes to the invite while it's pending and has lost access once it's revoked or
   * rejected (signalled, so the caller can say so instead of 404'ing); anyone else, an active contributor or the
   * owner, goes to what it contributes to.
   */
  private contributorUrl(
    session: Session,
    contributor: { userId: string | null; status: string },
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
    return `/rulesets/${klass.rulesetId}/classes/${klass.id}/${section}`;
  }

  /** The page of a player's campaign (`path` under it), or null when the player is gone. */
  private async playerCampaignUrl(playerId: string, path = "") {
    const player = await Players.findOne(db, { id: playerId });
    if (!player) return null;
    return `/campaigns/${player.campaignId}${path}`;
  }

  async getActivities(
    session: Session,
    where: {
      search?: string;
      targetTable?: string;
      type?: string;
      orderBy?: "createdAt" | "type";
      orderDir?: "asc" | "desc";
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
      case "users":
      case "sessions":
        return null;

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
        return modifier ? await this.resolveCustomizationUrl(modifier.sourceId, modifier.sourceType) : null;
      }
      case "requirements": {
        const requirement = await Requirements.findOne(db, { id: targetId });
        return requirement ? await this.resolveCustomizationUrl(requirement.entityId, requirement.entityType) : null;
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
