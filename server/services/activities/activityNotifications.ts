import type { InferInsertModel } from "drizzle-orm";

import type { Db } from "@/drizzle/database.ts";
import type { activitiesInAccount } from "@/drizzle/schema.ts";
import { Engine } from "@/engine/index.ts";
import {
  Activities,
  CharacterContributors,
  Characters,
  Contributors,
  Entities,
  Invites,
  Modifiers,
  Notifications,
  Players,
  Requirements,
  RULESET_ENTITY_TYPES,
  Rulesets,
  Users,
  Visibility,
} from "@/server/repositories/index.ts";
import { noteNotified } from "@/server/websockets/index.ts";
import { TARGET_TYPES } from "@/shared/activityTargets.ts";
import { isOneOf } from "@/shared/isOneOf.ts";
import { isRecord } from "@/shared/isRecord.ts";
import type { Ruleset } from "@/shared/relations.ts";

/** The ruleset a change to its content is in: its id, and its row while it's unarchived. */
interface ChangedRuleset {
  id: string;
  row: Ruleset | undefined;
}

/** A row of a ruleset's content, by its type: an entity, or what belongs to one (a class level, a customization). */
interface ContentRow {
  id: string;
  type: string;
}

type ActivityValues = InferInsertModel<typeof activitiesInAccount>;

/**
 * Who hears of an activity: the contributor it's about (a ruleset's, a character's) or the owner of what they contribute
 * to, the Game Masters of the campaign an invite is to or the user it invites, a ruleset's owner and active contributors.
 */
type Recipient =
  | "characterContributor"
  | "characterOwner"
  | "gameMasters"
  | "invitee"
  | "rulesetContributor"
  | "rulesetOwner"
  | "rulesetStakeholders";

/**
 * The customizations of a ruleset's content, by their type, and the row each belongs to: a customization's entity (a
 * requirement's may be a modifier).
 */
const CUSTOMIZATION_OWNERS = new Map<string, (db: Db, id: string) => Promise<ContentRow | undefined>>([
  [
    TARGET_TYPES.modifiers,
    async (db, id) => {
      const modifier = await Modifiers.findOne(db, { id });
      return modifier && { id: modifier.sourceId, type: modifier.sourceType };
    },
  ],
  [
    TARGET_TYPES.requirements,
    async (db, id) => {
      const requirement = await Requirements.findOne(db, { id });
      return requirement && { id: requirement.entityId, type: requirement.entityType };
    },
  ],
]);

/**
 * Who hears of an activity on an invite or a contributor, by its type. A revocation reaches a contributor who was
 * collaborating: revoking a pending invite is just "I changed my mind", worth no ping (a campaign invite's reaches no one).
 */
const RECIPIENTS = new Map<string, Recipient>([
  ["acceptCampaignInvite", "gameMasters"],
  ["acceptCharacterContributorInvite", "characterOwner"],
  ["acceptContributorInvite", "rulesetOwner"],
  ["createCampaignInvite", "invitee"],
  ["inviteCharacterContributor", "characterContributor"],
  ["inviteContributor", "rulesetContributor"],
  ["leaveCharacter", "characterOwner"],
  ["leaveRuleset", "rulesetOwner"],
  ["rejectCampaignInvite", "gameMasters"],
  ["rejectCharacterContributorInvite", "characterOwner"],
  ["rejectContributorInvite", "rulesetOwner"],
  ["revokeCharacterContributor", "characterContributor"],
  ["revokeContributor", "rulesetContributor"],
  ["updateContributorRole", "rulesetContributor"],
]);

/** Whether a type is of a ruleset's content, whose every change its stakeholders hear of. */
function isContentType(type: string) {
  return (
    isOneOf(type, RULESET_ENTITY_TYPES) ||
    Engine.storage().ownerOf(type) !== undefined ||
    Engine.storage().editedLinks().has(type) ||
    CUSTOMIZATION_OWNERS.has(type)
  );
}

/** An id an activity's data holds (`invitedUserId`, `rulesetId`), when it holds one. */
function readId(value: unknown) {
  return typeof value === "string" ? value : undefined;
}

/**
 * The ruleset a change to its content (`activity`, carrying `data`) is in: a delete names it, the row it removed being
 * gone.
 */
async function findChangedRuleset(
  db: Db,
  { targetId, targetType }: ActivityValues,
  data: Record<string, unknown>,
): Promise<ChangedRuleset | undefined> {
  const id = readId(data.rulesetId) ?? (await findContentRuleset(db, { id: targetId, type: targetType }));
  return id ? { id, row: await Rulesets.findOne(db, { id }) } : undefined;
}

/**
 * The row a row of a ruleset's content beside its entities belongs to: an owned entity's owner (a class level's class),
 * an edited link's owner (a class's skills' activity targets the class), a customization's entity.
 */
async function findContentOwner(db: Db, { id, type }: ContentRow): Promise<ContentRow | undefined> {
  const ownerType = Engine.storage().ownerOf(type);
  if (ownerType) {
    const [owned] = await Entities.findPositions(db, { entityType: type, ids: [id] });
    return owned && { id: owned.ownerId, type: ownerType };
  }
  const edited = Engine.storage().editedLinks().get(type);
  if (edited) return { id, type: edited.from };
  return await CUSTOMIZATION_OWNERS.get(type)?.(db, id);
}

/** The ruleset a row of its content is in: an entity's own, or that of the row it belongs to. */
async function findContentRuleset(db: Db, { id, type }: ContentRow): Promise<string | undefined> {
  if (isOneOf(type, RULESET_ENTITY_TYPES)) return (await Entities.findOne(db, { entityType: type, id }))?.rulesetId;
  const owner = await findContentOwner(db, { id, type });
  return owner && (await findContentRuleset(db, owner));
}

/** The Game Masters of the campaign an invite (`inviteId`) is to. */
async function findGameMasters(db: Db, inviteId: string) {
  const invite = await Invites.findOne(db, { id: inviteId });
  const player = invite && (await Players.findOne(db, { id: invite.playerId }));
  if (!player) return [];
  const players = await Players.findMany(db, { campaignId: player.campaignId });
  return players.filter((campaignPlayer) => campaignPlayer.role === "Game Master").map(({ userId }) => userId);
}

/**
 * The users an activity notifies (`RECIPIENTS`, or a change to a ruleset's content, `changed`, its stakeholders), but
 * its actor.
 */
async function findRecipientIds(
  db: Db,
  activity: ActivityValues,
  data: Record<string, unknown>,
  changed: ChangedRuleset | undefined,
) {
  const recipient =
    RECIPIENTS.get(activity.type) ?? (isContentType(activity.targetType) ? "rulesetStakeholders" : undefined);
  const userIds = recipient ? await findRecipients(db, recipient, activity, data, changed) : [];
  const recipientIds = new Set<string>();
  for (const userId of userIds) if (userId && userId !== activity.userId) recipientIds.add(userId);
  return [...recipientIds];
}

/**
 * Who an activity (`activity`, carrying `data`, about the content of `changed`) notifies, as its `recipient`: their
 * users, when they have one.
 */
async function findRecipients(
  db: Db,
  recipient: Recipient,
  { targetId }: ActivityValues,
  data: Record<string, unknown>,
  changed: ChangedRuleset | undefined,
): Promise<(string | null | undefined)[]> {
  // A revocation names what the contributor was, and reaches them only if they were collaborating
  if ("prevStatus" in data && data.prevStatus !== "Active") return [];
  switch (recipient) {
    case "characterContributor":
      return [(await CharacterContributors.findOne(db, { id: targetId }))?.userId];
    case "characterOwner": {
      const characterId =
        readId(data.characterId) ?? (await CharacterContributors.findOne(db, { id: targetId }))?.characterId;
      return [characterId && (await Characters.findOne(db, { id: characterId }, Visibility.All))?.userId];
    }
    case "gameMasters":
      return await findGameMasters(db, targetId);
    case "invitee":
      return [readId(data.invitedUserId)];
    case "rulesetContributor":
      return [(await Contributors.findOne(db, { id: targetId }))?.userId];
    case "rulesetOwner": {
      const rulesetId = readId(data.rulesetId) ?? (await Contributors.findOne(db, { id: targetId }))?.rulesetId;
      return [rulesetId && (await Rulesets.findOne(db, { id: rulesetId }))?.userId];
    }
    case "rulesetStakeholders":
      return changed ? await findRulesetStakeholders(db, changed) : [];
  }
}

/** A ruleset's owner and its active contributors, who hear of a change to its content. */
async function findRulesetStakeholders(db: Db, { id, row }: ChangedRuleset) {
  const contributors = await Contributors.findMany(db, { rulesetId: id, status: "Active" });
  return [row?.userId, ...contributors.map(({ userId }) => userId)];
}

/**
 * Records an activity (`values`), and notifies the users it concerns, but its actor: a notification each, carrying the
 * activity's data and the actor's name, which their pages hear of once the request is answered. A change to a ruleset's
 * content records its ruleset's base rules with it, whose words name what it changed ("created spell Fireball").
 */
export async function createActivityWithNotifications(tx: Db, values: ActivityValues) {
  const given = isRecord(values.data) ? values.data : {};
  const changed = isContentType(values.targetType) ? await findChangedRuleset(tx, values, given) : undefined;
  const data = changed?.row ? { ...given, baseRules: changed.row.baseRules } : given;
  const [activity] = await Activities.create(tx, changed?.row ? { ...values, data } : values);
  const recipientIds = await findRecipientIds(tx, values, data, changed);
  if (recipientIds.length === 0) return;

  const actor = await Users.findOne(tx, { id: values.userId });
  const actorName = actor?.username ?? actor?.emailAddress ?? "Unknown";
  const { targetId, targetType, type, userId: actorId } = values;
  await Notifications.createMany(
    tx,
    recipientIds.map((recipientId) => ({
      recipientId,
      actorId,
      activityId: activity.id,
      type,
      targetId,
      targetType,
      data: { ...data, actorName },
    })),
  );
  // Their pages hear of it once the request is answered, and its transaction committed
  noteNotified(recipientIds);
}
