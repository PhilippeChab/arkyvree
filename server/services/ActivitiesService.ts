import { db } from "@/server/database/index.ts";
import {
  Activities,
  CharacterContributors,
  Contributors,
  Feats,
  Powers,
  Skills,
  Races,
  Klasses,
  Items,
  Saves,
  Languages,
  Aptitudes,
  KlassLevels,
  Players,
  Invites,
  Modifiers,
  Requirements,
  Properties,
} from "@/server/repositories/index.ts";
import BaseService from "@/server/services/BaseService.ts";
import type { Session } from "@/shared/relations.ts";

const CUSTOMIZATION_ENTITIES = new Set(["feats", "powers", "items", "races"]);

async function resolveRulesSubEntity(targetTable: string, targetId: string): Promise<string | null> {
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

async function resolveCustomizationUrl(entityId: string, entityType: string): Promise<string | null> {
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

export const ActivitiesMethods = {
  async findActivities(
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
    return await Activities.findMany(
      db,
      {
        userId: session.userId,
        ...where,
      },
      pagination,
    );
  },

  async resolveActivityUrl(session: Session, targetTable: string, targetId: string): Promise<string | null | { noAccess: true; entityType: "ruleset" | "character" }> {
    // Top-level entities — no lookup needed
    switch (targetTable) {
      case "rulesets":
        return `/rulesets/${targetId}`;
      case "characters":
        return `/characters/${targetId}`;
      case "campaigns":
        return `/campaigns/${targetId}`;
      case "users":
      case "sessions":
        return null;
    }

    // Rules sub-entities (entity has rulesetId)
    const rulesUrl = await resolveRulesSubEntity(targetTable, targetId);
    if (rulesUrl) return rulesUrl;

    // Class sub-entities
    if (targetTable === "klass_levels") {
      const klassLevel = await KlassLevels.findOne(db, { id: targetId });
      if (!klassLevel) return null;
      const klass = await Klasses.findOne(db, { id: klassLevel.klassId });
      if (!klass) return null;
      return `/rulesets/${klass.rulesetId}/classes/${klass.id}/levels`;
    }

    if (targetTable === "klass_skills") {
      // targetId is klassId for klassSkills activities
      const klass = await Klasses.findOne(db, { id: targetId });
      if (!klass) return null;
      return `/rulesets/${klass.rulesetId}/classes/${klass.id}/skills`;
    }

    // Character sub-entities (targetId is characterId)
    if (targetTable === "inventory" || targetTable === "levels") {
      return `/characters/${targetId}`;
    }

    // Campaign sub-entities
    if (targetTable === "players") {
      const player = await Players.findOne(db, { id: targetId });
      if (!player) return null;
      return `/campaigns/${player.campaignId}`;
    }

    if (targetTable === "invites") {
      const invite = await Invites.findOne(db, { id: targetId });
      if (!invite) return null;
      const player = await Players.findOne(db, { id: invite.playerId });
      if (!player) return null;
      return `/campaigns/${player.campaignId}`;
    }

    // Ruleset contributor — invitee with a pending invite goes to the accept
    // page; an active contributor or the owner lands on the ruleset itself.
    // A revoked/rejected invitee no longer has access; signal that explicitly
    // so the caller can surface the right message instead of 404'ing.
    if (targetTable === "contributors") {
      const contributor = await Contributors.findOne(db, { id: targetId });
      if (!contributor) return null;
      const isInvitee = contributor.userId === session.userId;
      if (isInvitee) {
        if (contributor.status === "Pending") return `/ruleset-contributor-invite/${targetId}`;
        if (contributor.status !== "Active") return { noAccess: true, entityType: "ruleset" };
      }
      return `/rulesets/${contributor.rulesetId}`;
    }

    // Character contributor — same logic as ruleset contributors.
    if (targetTable === "character_contributors") {
      const contributor = await CharacterContributors.findOne(db, { id: targetId });
      if (!contributor) return null;
      const isInvitee = contributor.userId === session.userId;
      if (isInvitee) {
        if (contributor.status === "Pending") return `/character-contributor-invite/${targetId}`;
        if (contributor.status !== "Active") return { noAccess: true, entityType: "character" };
      }
      return `/characters/${contributor.characterId}`;
    }

    // Customization entities
    if (targetTable === "modifiers") {
      const modifier = await Modifiers.findOne(db, { id: targetId });
      if (!modifier) return null;
      return await resolveCustomizationUrl(modifier.sourceId, modifier.sourceType);
    }

    if (targetTable === "requirements") {
      const requirement = await Requirements.findOne(db, { id: targetId });
      if (!requirement) return null;
      return await resolveCustomizationUrl(requirement.entityId, requirement.entityType);
    }

    if (targetTable === "properties") {
      const property = await Properties.findOne(db, { id: targetId });
      if (!property) return null;
      return await resolveCustomizationUrl(property.entityId, property.entityType);
    }

    return null;
  },
} as const;

class ActivitiesService extends BaseService<typeof ActivitiesMethods> {
  static initialize() {
    return new ActivitiesService(ActivitiesMethods);
  }
}

export default ActivitiesService;
