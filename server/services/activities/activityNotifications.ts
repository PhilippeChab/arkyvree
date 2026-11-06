import type { InferInsertModel } from "drizzle-orm";

import type { Db } from "@/drizzle/database.ts";
import type { activitiesInAccount } from "@/drizzle/schema.ts";
import {
  Activities,
  CharacterContributors,
  Characters,
  Contributors,
  Invites,
  Notifications,
  Players,
  Rulesets,
  Users,
  Visibility,
} from "@/server/repositories/index.ts";
import { noteNotified } from "@/server/websockets/index.ts";
import { isRecord } from "@/shared/isRecord.ts";
import type { Ruleset } from "@/shared/relations.ts";

type ActivityValues = InferInsertModel<typeof activitiesInAccount>;

/**
 * Who hears of an activity: the contributor it's about (a ruleset's, a character's) or the owner of what they contribute
 * to, the Game Masters of the campaign an invite is to or the user it invites, the player it makes a Game Master, a
 * ruleset's owner and active contributors.
 */
type Recipient =
  | "characterContributor"
  | "characterOwner"
  | "gameMasters"
  | "invitee"
  | "promotedPlayer"
  | "rulesetContributor"
  | "rulesetOwner"
  | "rulesetStakeholders";

/**
 * Who hears of an activity on an invite, a contributor or a seat, by its type. A revocation reaches a contributor who was
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
  ["promoteCampaignPlayer", "promotedPlayer"],
  ["rejectCampaignInvite", "gameMasters"],
  ["rejectCharacterContributorInvite", "characterOwner"],
  ["rejectContributorInvite", "rulesetOwner"],
  ["revokeCharacterContributor", "characterContributor"],
  ["revokeContributor", "rulesetContributor"],
  ["updateContributorRole", "rulesetContributor"],
]);

/** An id an activity's data holds (`invitedUserId`, `rulesetId`), when it holds one. */
function readId(value: unknown) {
  return typeof value === "string" ? value : undefined;
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
  changed: Ruleset | undefined,
) {
  const recipient = RECIPIENTS.get(activity.type) ?? (changed ? "rulesetStakeholders" : undefined);
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
  changed: Ruleset | undefined,
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
    case "promotedPlayer":
      return [readId(data.promotedUserId)];
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
async function findRulesetStakeholders(db: Db, ruleset: Ruleset) {
  const contributors = await Contributors.findMany(db, { rulesetId: ruleset.id, status: "Active" });
  return [ruleset.userId, ...contributors.map(({ userId }) => userId)];
}

/**
 * Records an activity (`values`), and notifies the users it concerns, but its actor: a notification each, carrying the
 * activity's data and the actor's name, which their pages hear of once the request is answered. A change to a ruleset's
 * content names the ruleset its write changed (`changed`), whose owner and active contributors hear of it, and records
 * its base rules with it, whose words name what it changed ("created spell Fireball").
 */
async function recordActivity(tx: Db, changed: Ruleset | undefined, values: ActivityValues) {
  const given = isRecord(values.data) ? values.data : {};
  const data = changed ? { ...given, baseRules: changed.baseRules } : given;
  const [activity] = await Activities.create(tx, changed ? { ...values, data } : values);
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

/** Records an activity of no ruleset's content (`values`: a campaign's, a character's), and notifies whom it concerns. */
export async function createActivityWithNotifications(tx: Db, values: ActivityValues) {
  await recordActivity(tx, undefined, values);
}

/**
 * Records a change to a ruleset's content (`values`: an entity's, a customization's), in the ruleset its write changed
 * (`ruleset`), and notifies its owner and active contributors.
 */
export async function createContentActivityWithNotifications(tx: Db, ruleset: Ruleset, values: ActivityValues) {
  await recordActivity(tx, ruleset, values);
}
