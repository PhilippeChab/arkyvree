import type { InferInsertModel } from "drizzle-orm";

import type { activitiesInAccount } from "@/drizzle/schema.ts";
import { EntityRepositories } from "@/server/cow/index.ts";
import type { Db } from "@/server/database/index.ts";
import {
  Activities,
  CharacterContributors,
  Characters,
  Contributors,
  Invites,
  KlassLevels,
  Modifiers,
  Notifications,
  Players,
  Properties,
  Requirements,
  RULESET_ENTITY_TYPES,
  Rulesets,
  Users,
  Visibility,
} from "@/server/repositories/index.ts";
import { noteNotified } from "@/server/websockets/index.ts";
import { isOneOf } from "@/shared/isOneOf.ts";
import { isRecord } from "@/shared/isRecord.ts";

type ActivityValues = InferInsertModel<typeof activitiesInAccount>;

/** A row of a ruleset's content, by its table: an entity, or what belongs to one (a class level, a customization). */
interface ContentRow {
  id: string;
  table: string;
}

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
 * The rows of a ruleset's content beside its entities, by their table, and the row each belongs to: a class level's
 * class, a customization's entity (a requirement's may be a modifier). A class skill's activity targets its class.
 */
const CONTENT_OWNERS = new Map<string, (db: Db, id: string) => Promise<ContentRow | undefined>>([
  [
    "klass_levels",
    async (db, id) => {
      const level = await KlassLevels.findOne(db, { id });
      return level && { id: level.klassId, table: "klasses" };
    },
  ],
  ["klass_skills", async (_db, id) => ({ id, table: "klasses" })],
  [
    "modifiers",
    async (db, id) => {
      const modifier = await Modifiers.findOne(db, { id });
      return modifier && { id: modifier.sourceId, table: modifier.sourceType };
    },
  ],
  [
    "properties",
    async (db, id) => {
      const property = await Properties.findOne(db, { id });
      return property && { id: property.entityId, table: property.entityType };
    },
  ],
  [
    "requirements",
    async (db, id) => {
      const requirement = await Requirements.findOne(db, { id });
      return requirement && { id: requirement.entityId, table: requirement.entityType };
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

/** Whether a table holds a ruleset's content, whose every change its stakeholders hear of. */
function isContentTable(table: string) {
  return isOneOf(table, RULESET_ENTITY_TYPES) || CONTENT_OWNERS.has(table);
}

/** An id an activity's data holds (`invitedUserId`, `rulesetId`), when it holds one. */
function readId(value: unknown) {
  return typeof value === "string" ? value : undefined;
}

/** The ruleset a row of its content is in: an entity's own, or that of the row it belongs to. */
async function findContentRuleset(db: Db, { id, table }: ContentRow): Promise<string | undefined> {
  if (isOneOf(table, RULESET_ENTITY_TYPES)) return (await EntityRepositories.of(table).findOne(db, { id }))?.rulesetId;
  const owner = await CONTENT_OWNERS.get(table)?.(db, id);
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

/** The users an activity notifies (`RECIPIENTS`, or a change to a ruleset's content its stakeholders), but its actor. */
async function findRecipientIds(db: Db, activity: ActivityValues, data: Record<string, unknown>) {
  const recipient =
    RECIPIENTS.get(activity.type) ?? (isContentTable(activity.targetTable) ? "rulesetStakeholders" : undefined);
  const userIds = recipient ? await findRecipients(db, recipient, activity, data) : [];
  const recipientIds = new Set<string>();
  for (const userId of userIds) if (userId && userId !== activity.userId) recipientIds.add(userId);
  return [...recipientIds];
}

/** Who an activity (`activity`, carrying `data`) notifies, as its `recipient`: their users, when they have one. */
async function findRecipients(
  db: Db,
  recipient: Recipient,
  { targetId, targetTable }: ActivityValues,
  data: Record<string, unknown>,
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
      return [rulesetId && (await Rulesets.findOne(db, { id: rulesetId }, Visibility.All))?.userId];
    }
    case "rulesetStakeholders": {
      // A delete names its ruleset: the row it removed is gone
      const rulesetId = readId(data.rulesetId) ?? (await findContentRuleset(db, { id: targetId, table: targetTable }));
      return rulesetId ? await findRulesetStakeholders(db, rulesetId) : [];
    }
  }
}

/** A ruleset's owner and its active contributors, who hear of a change to its content. */
async function findRulesetStakeholders(db: Db, rulesetId: string) {
  // `db` is the caller's transaction, whose queries run one at a time.
  const contributors = await Contributors.findMany(db, { rulesetId, status: "Active" });
  const ruleset = await Rulesets.findOne(db, { id: rulesetId });
  return [ruleset?.userId, ...contributors.map(({ userId }) => userId)];
}

/**
 * Records an activity (`values`), and notifies the users it concerns, but its actor: a notification each, carrying the
 * activity's data and the actor's name, which their pages hear of once the request is answered.
 */
export async function createActivityWithNotifications(tx: Db, values: ActivityValues) {
  const [activity] = await Activities.create(tx, values);
  const data = isRecord(values.data) ? values.data : {};
  const recipientIds = await findRecipientIds(tx, values, data);
  if (recipientIds.length === 0) return;

  const actor = await Users.findOne(tx, { id: values.userId });
  const actorName = actor?.username ?? actor?.emailAddress ?? "Unknown";
  const { targetId, targetTable, type, userId: actorId } = values;
  await Notifications.createMany(
    tx,
    recipientIds.map((recipientId) => ({
      recipientId,
      actorId,
      activityId: activity.id,
      type,
      targetId,
      targetTable,
      data: { ...data, actorName },
    })),
  );
  // Their pages hear of it once the request is answered, and its transaction committed
  noteNotified(recipientIds);
}
