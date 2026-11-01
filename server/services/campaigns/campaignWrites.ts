import type { Db } from "@/drizzle/database.ts";
import { NotFoundError } from "@/server/errors/index.ts";
import { Campaigns, Invites, Players, Rulesets, Visibility } from "@/server/repositories/index.ts";
import type { RulesetsPolicy } from "@/server/services/policies/index.ts";
import { getReadableRuleset, withBoundedWrite } from "@/server/services/rulesets/index.ts";
import type { Session } from "@/shared/relations.ts";

import { getReadableCampaign } from "./readableCampaign.ts";

/** What a write that gave up on a lock answers: another save held the campaign. */
export const BUSY_CAMPAIGN_MESSAGE = "The campaign is being changed by another save; try again";

/**
 * Runs the creation of a campaign in a ruleset (`rulesetId`): the ruleset's row locked shared, so no write of its own
 * row (its archive, its status) runs meanwhile, then the session's policy on it, if it may read it
 * (`getReadableRuleset`, the 404 an unknown ruleset gets otherwise). Rulesets are locked before campaigns, and campaigns
 * before characters, as every write that locks several takes them.
 */
export async function withCampaignCreate<T>(
  session: Session,
  rulesetId: string,
  write: (tx: Db, policy: RulesetsPolicy) => Promise<T>,
): Promise<T> {
  return await withBoundedWrite(BUSY_CAMPAIGN_MESSAGE, async (tx) => {
    if (!(await Rulesets.lock(tx, { id: rulesetId }, "share"))) throw new NotFoundError("Ruleset not found");
    return await write(tx, (await getReadableRuleset(tx, session, rulesetId)).policy);
  });
}

/**
 * Runs a write of a campaign (`campaignId`: its own row, its players and their seats, its invites, its characters'
 * links), the one way such a write opens its transaction: the campaign's row locked first, archived or not, so its
 * writes take turns (two Game Masters' removals of each other read each other's seat in turn, so the last one stays),
 * then the session's access (`getReadableCampaign`, of `visibility`: what it acts on), before the write reads
 * anything. A write that waited past the lock wait, or deadlocked, is refused as a conflict (`BUSY_CAMPAIGN_MESSAGE`).
 */
export async function withCampaignWrite<T>(
  session: Session,
  campaignId: string,
  write: (tx: Db, readable: Awaited<ReturnType<typeof getReadableCampaign>>) => Promise<T>,
  visibility: Visibility = Visibility.All,
): Promise<T> {
  return await withBoundedWrite(BUSY_CAMPAIGN_MESSAGE, async (tx) => {
    if (!(await Campaigns.lock(tx, { id: campaignId, visibility: Visibility.All }, "no key update")))
      throw new NotFoundError("Campaign not found");
    return await write(tx, await getReadableCampaign(tx, session, campaignId, visibility));
  });
}

/**
 * Runs a write of an invite (`inviteId`) under its campaign's lock, which decides the session's rights itself (an
 * invitee's answer, by a session that may not read the campaign yet): an unknown invite refused as not found (`notFound`).
 * An invite's seat, and a seat's campaign, never change, so they're read before the lock.
 */
export async function withInviteCampaign<T>(inviteId: string, notFound: string, write: (tx: Db) => Promise<T>) {
  return await withBoundedWrite(BUSY_CAMPAIGN_MESSAGE, async (tx) => {
    const invite = await Invites.findOne(tx, { id: inviteId });
    const player = invite && (await Players.findOne(tx, { id: invite.playerId }, Visibility.All));
    if (!player || !(await Campaigns.lock(tx, { id: player.campaignId, visibility: Visibility.All }, "no key update")))
      throw new NotFoundError(notFound);
    return await write(tx);
  });
}
