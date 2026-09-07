import { getTableName } from "drizzle-orm";

import {
  Activities,
  Aptitudes,
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
  Notifications,
  Players,
  Powers,
  Properties,
  Races,
  Requirements,
  Rulesets,
  Saves,
  Skills,
  Users,
} from "@/server/repositories/index.ts";
import { Visibility } from "@/server/repositories/BaseRepository.ts";
import {
  contributorsInCharacter,
  contributorsInRules,
  invitesInCampaign,
} from "@/drizzle/schema.ts";

import type { Db } from "@/server/database/index.ts";
import type { InferInsertModel } from "drizzle-orm";
import type { activitiesInAccount } from "@/drizzle/schema.ts";

// Tables whose entities have a direct rulesetId
const RULESET_ENTITY_TABLES = new Set([
  "feats", "powers", "skills", "races", "klasses", "items", "saves", "languages", "aptitudes", "mechanics",
]);

// Customization tables whose source entities have a rulesetId
const CUSTOMIZATION_TABLES = new Set(["modifiers", "requirements", "properties"]);

const INVITES_TABLE = getTableName(invitesInCampaign);
const CONTRIBUTORS_TABLE = getTableName(contributorsInRules);
const CHARACTER_CONTRIBUTORS_TABLE = getTableName(contributorsInCharacter);

type ActivityValues = InferInsertModel<typeof activitiesInAccount>;

const LONG_TEXT_FIELDS = new Set(["description"]);

function normalize(v: unknown): string {
  if (typeof v === "number") return String(v);
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    if (Number.isFinite(n)) return String(n);
  }
  return String(v);
}

/**
 * Compare an existing entity with an update body and return a list of changes.
 * Short fields include before/after values; long text fields only note the change.
 */
export function getChangedFields(
  existing: Record<string, unknown>,
  body: Record<string, unknown>,
): { field: string; from?: string; to?: string }[] {
  const changes: { field: string; from?: string; to?: string }[] = [];
  for (const key of Object.keys(body)) {
    if (!(key in existing)) continue;
    const oldVal = existing[key];
    const newVal = body[key];
    if (oldVal == null && newVal == null) continue;
    if (normalize(oldVal) === normalize(newVal)) continue;

    if (LONG_TEXT_FIELDS.has(key)) {
      changes.push({ field: key });
    } else {
      changes.push({
        field: key,
        from: oldVal != null ? normalize(oldVal) : undefined,
        to: newVal != null ? normalize(newVal) : undefined,
      });
    }
  }
  return changes;
}

/**
 * Resolve the rulesetId from a target entity. Used for ruleset content change notifications.
 */
async function resolveRulesetId(db: Db, targetTable: string, targetId: string): Promise<string | null> {
  if (RULESET_ENTITY_TABLES.has(targetTable)) {
    const finders: Record<string, (id: string) => Promise<{ rulesetId: string } | undefined>> = {
      feats: (id) => Feats.findOne(db, { id }),
      powers: (id) => Powers.findOne(db, { id }),
      skills: (id) => Skills.findOne(db, { id }),
      races: (id) => Races.findOne(db, { id }),
      klasses: (id) => Klasses.findOne(db, { id }),
      items: (id) => Items.findOne(db, { id }),
      saves: (id) => Saves.findOne(db, { id }),
      languages: (id) => Languages.findOne(db, { id }),
      aptitudes: (id) => Aptitudes.findOne(db, { id }),
    };
    const entity = await finders[targetTable]?.(targetId);
    return entity?.rulesetId ?? null;
  }

  if (targetTable === "klass_levels") {
    const klassLevel = await KlassLevels.findOne(db, { id: targetId });
    if (!klassLevel) return null;
    const klass = await Klasses.findOne(db, { id: klassLevel.klassId });
    return klass?.rulesetId ?? null;
  }

  if (targetTable === "klass_skills") {
    const klass = await Klasses.findOne(db, { id: targetId });
    return klass?.rulesetId ?? null;
  }

  if (CUSTOMIZATION_TABLES.has(targetTable)) {
    if (targetTable === "modifiers") {
      const modifier = await Modifiers.findOne(db, { id: targetId });
      if (!modifier) return null;
      return resolveRulesetId(db, modifier.sourceType, modifier.sourceId);
    }
    if (targetTable === "requirements") {
      const req = await Requirements.findOne(db, { id: targetId });
      if (!req) return null;
      return resolveRulesetId(db, req.entityType, req.entityId);
    }
    if (targetTable === "properties") {
      const prop = await Properties.findOne(db, { id: targetId });
      if (!prop) return null;
      return resolveRulesetId(db, prop.entityType, prop.entityId);
    }
  }

  return null;
}

/**
 * Get all active contributor userIds + ruleset owner for a given rulesetId.
 */
async function getRulesetStakeholders(db: Db, rulesetId: string): Promise<string[]> {
  const [contributors, ruleset] = await Promise.all([
    Contributors.findActiveByRulesetId(db, { rulesetId }),
    Rulesets.findOne(db, { id: rulesetId }),
  ]);

  const userIds = new Set<string>();
  if (ruleset?.userId) userIds.add(ruleset.userId);
  for (const c of contributors) {
    if (c.userId) userIds.add(c.userId);
  }
  return Array.from(userIds);
}

/**
 * Get campaign GMs for the campaign that owns a given invite.
 */
async function getCampaignGMsForInvite(db: Db, inviteId: string): Promise<string[]> {
  const invite = await Invites.findOne(db, { id: inviteId });
  if (!invite) return [];
  const player = await Players.findOne(db, { id: invite.playerId });
  if (!player) return [];
  const campaignPlayers = await Players.findMany(db, { campaignId: player.campaignId });
  return campaignPlayers
    .filter((p) => p.role === "Game Master" && p.userId)
    .map((p) => p.userId!);
}

/**
 * Determine which users should be notified for a given activity.
 * The actor is always excluded from the result.
 */
async function resolveRecipients(
  db: Db,
  actorId: string,
  type: string,
  targetId: string,
  targetTable: string,
  data: unknown,
): Promise<string[]> {
  const recipients = new Set<string>();
  const d = (data ?? {}) as Record<string, unknown>;

  // ── Campaign invites ──────────────────────────────────────────────
  if (targetTable === INVITES_TABLE) {
    if (type === "createCampaignInvite") {
      // Notify the invitee (if they have an account)
      const invitedUserId = d.invitedUserId as string | undefined;
      if (invitedUserId) recipients.add(invitedUserId);
    } else if (type === "acceptCampaignInvite" || type === "rejectCampaignInvite") {
      // Notify campaign GMs
      const gms = await getCampaignGMsForInvite(db, targetId);
      for (const gm of gms) recipients.add(gm);
    }
  }

  // ── Ruleset contributors ──────────────────────────────────────────
  if (targetTable === CONTRIBUTORS_TABLE) {
    if (type === "inviteContributor") {
      const contributor = await Contributors.findOne(db, { id: targetId });
      if (contributor?.userId) recipients.add(contributor.userId);
    } else if (type === "acceptContributorInvite" || type === "rejectContributorInvite" || type === "leaveRuleset") {
      // data may have rulesetId directly, or we look up via the contributor record (targetId)
      let rulesetId = d.rulesetId as string | undefined;
      if (!rulesetId) {
        const contributor = await Contributors.findOne(db, { id: targetId });
        rulesetId = contributor?.rulesetId;
      }
      if (rulesetId) {
        const ruleset = await Rulesets.findOne(db, { id: rulesetId }, Visibility.All);
        if (ruleset?.userId) recipients.add(ruleset.userId);
      }
    } else if (type === "updateContributorRole") {
      const contributor = await Contributors.findOne(db, { id: targetId });
      if (contributor?.userId) recipients.add(contributor.userId);
    } else if (type === "revokeContributor") {
      // Only notify if they were actively collaborating; revoking a pending
      // invite is just "I changed my mind" and doesn't warrant a ping.
      if (d.prevStatus === "Active") {
        const contributor = await Contributors.findOne(db, { id: targetId });
        if (contributor?.userId) recipients.add(contributor.userId);
      }
    }
  }

  // ── Character contributors ────────────────────────────────────────
  if (targetTable === CHARACTER_CONTRIBUTORS_TABLE) {
    if (type === "inviteCharacterContributor") {
      const contributor = await CharacterContributors.findOne(db, { id: targetId });
      if (contributor?.userId) recipients.add(contributor.userId);
    } else if (type === "acceptCharacterContributorInvite" || type === "rejectCharacterContributorInvite" || type === "leaveCharacter") {
      let characterId = d.characterId as string | undefined;
      if (!characterId) {
        const contributor = await CharacterContributors.findOne(db, { id: targetId });
        characterId = contributor?.characterId;
      }
      if (characterId) {
        const character = await Characters.findOne(db, { id: characterId }, Visibility.All);
        if (character?.userId) recipients.add(character.userId);
      }
    } else if (type === "revokeCharacterContributor") {
      if (d.prevStatus === "Active") {
        const contributor = await CharacterContributors.findOne(db, { id: targetId });
        if (contributor?.userId) recipients.add(contributor.userId);
      }
    }
  }

  // ── Ruleset content changes ───────────────────────────────────────
  const isContentChange = type.startsWith("create") || type.startsWith("update") || type.startsWith("delete");
  const isRulesetContent = RULESET_ENTITY_TABLES.has(targetTable)
    || targetTable === "klass_levels" || targetTable === "klass_skills"
    || CUSTOMIZATION_TABLES.has(targetTable);

  if (isContentChange && isRulesetContent) {
    // Prefer rulesetId from data (required for deletes where the entity is already archived)
    const rulesetId = (d.rulesetId as string | undefined) ?? await resolveRulesetId(db, targetTable, targetId);
    if (rulesetId) {
      const stakeholders = await getRulesetStakeholders(db, rulesetId);
      for (const uid of stakeholders) recipients.add(uid);
    }
  }

  // Never notify the actor
  recipients.delete(actorId);
  return Array.from(recipients);
}

/**
 * Drop-in replacement for Activities.create that also creates notifications
 * for interested parties. Returns the created activity and recipient IDs
 * for WebSocket broadcasting.
 */
export async function createActivityWithNotifications(
  db: Db,
  values: ActivityValues,
): Promise<{ activity: Awaited<ReturnType<typeof Activities.create>>[0]; recipientIds: string[] }> {
  const [activity] = await Activities.create(db, values);

  const recipientIds = await resolveRecipients(
    db, values.userId, values.type, values.targetId, values.targetTable, values.data,
  );

  if (recipientIds.length > 0) {
    // Look up actor name once for all notification rows
    const actor = await Users.findOne(db, { id: values.userId });
    const actorName = actor?.username ?? actor?.emailAddress ?? "Unknown";

    await Notifications.createMany(
      db,
      recipientIds.map((recipientId) => ({
        recipientId,
        actorId: values.userId,
        activityId: activity.id,
        type: values.type,
        targetId: values.targetId,
        targetTable: values.targetTable,
        data: { ...(values.data as Record<string, unknown> ?? {}), actorName },
      })),
    );

  }

  return { activity, recipientIds };
}
