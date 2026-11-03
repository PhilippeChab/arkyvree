import type { Db } from "@/drizzle/database.ts";
import { withWrite } from "@/server/database/index.ts";
import { NotFoundError } from "@/server/errors/index.ts";
import { Invites, Locks, Players, Visibility } from "@/server/repositories/index.ts";
import { getReadableCampaign } from "@/server/services/campaigns/index.ts";
import type { RulesetsPolicy } from "@/server/services/policies/index.ts";
import { getReadableRuleset } from "@/server/services/rulesets/index.ts";
import type { Session } from "@/shared/relations.ts";

import { assertAccountStill, lockAccount, type NamedAccount } from "./userWrites.ts";

/** The account a campaign's write makes rows for (`account`: an invite's invitee). */
interface CampaignWriteOptions {
  account?: NamedAccount;
}

/** What a campaign's creation that gave up on a lock answers: another save held its ruleset or its creator's account. */
const BUSY_CREATION_MESSAGE = "The ruleset or your account is being changed by another save; try again";

/** What a write that gave up on a lock answers: another save held the campaign. */
export const BUSY_CAMPAIGN_MESSAGE = "The campaign is being changed by another save; try again";

/**
 * Runs the creation of a campaign in a ruleset (`rulesetId`): its creator's row locked shared, so an account's
 * deletion, which locks it first, waits for the seat it makes or makes it wait; then the ruleset's row shared, so no
 * write of its own row (its archive, its status) runs meanwhile; then the session's policy on it, if it may read it
 * (`getReadableRuleset`, the 404 an unknown ruleset gets otherwise). Users lock before rulesets, rulesets before
 * campaigns, and campaigns before characters, as every write that locks several takes them. A creator whose account
 * was deleted meanwhile is refused as its session is (401). A creation that waited past the lock wait is refused as a
 * conflict (`BUSY_CREATION_MESSAGE`).
 */
export async function withCampaignCreate<T>(
  session: Session,
  rulesetId: string,
  write: (tx: Db, policy: RulesetsPolicy) => Promise<T>,
): Promise<T> {
  return await withWrite(async (tx) => {
    await lockAccount(tx, { userId: session.userId });
    const ruleset = await Locks.lockRulesets(tx, { ids: [rulesetId] }, "share");
    if (!ruleset.has(rulesetId)) throw new NotFoundError("Ruleset not found");
    return await write(tx, (await getReadableRuleset(tx, session, rulesetId)).policy);
  }, BUSY_CREATION_MESSAGE);
}

/**
 * Runs a write of a campaign (`campaignId`: its own row, its players and their seats, its invites, its characters'
 * links), the one way such a write opens its transaction: the campaign's row locked first, archived or not, so its
 * writes take turns (two Game Masters' removals of each other read each other's seat in turn, so the last one stays),
 * then the session's access (`getReadableCampaign`, archived or not: the write's policy refuses the wrong state),
 * before the write reads anything. The account it makes rows for (`account`) is locked shared first (`lockAccount`). A
 * write that waited past the lock wait, or deadlocked, is refused as a conflict (`BUSY_CAMPAIGN_MESSAGE`).
 */
export async function withCampaignWrite<T>(
  session: Session,
  campaignId: string,
  write: (tx: Db, readable: Awaited<ReturnType<typeof getReadableCampaign>>) => Promise<T>,
  { account }: CampaignWriteOptions = {},
): Promise<T> {
  return await withWrite(async (tx) => {
    const accountId = account && (await lockAccount(tx, account));
    const locked = await Locks.lockCampaigns(tx, { ids: [campaignId] }, "no key update");
    if (locked.length === 0) throw new NotFoundError("Campaign not found");
    if (account) await assertAccountStill(tx, account, accountId);
    return await write(tx, await getReadableCampaign(tx, session, campaignId));
  }, BUSY_CAMPAIGN_MESSAGE);
}

/**
 * Runs a write of an invite (`inviteId`) under its campaign's lock, which decides the session's rights itself (an
 * invitee's answer, by a session that may not read the campaign yet): an unknown invite refused as not found. An
 * invite's seat, and a seat's campaign, never change, so they're read before the lock.
 */
export async function withInviteCampaign<T>(inviteId: string, write: (tx: Db) => Promise<T>): Promise<T> {
  return await withWrite(async (tx) => {
    const invite = await Invites.findOne(tx, { id: inviteId });
    const player = invite && (await Players.findOne(tx, { id: invite.playerId }, Visibility.All));
    const locked = player && (await Locks.lockCampaigns(tx, { ids: [player.campaignId] }, "no key update"));
    if (!locked || locked.length === 0) throw new NotFoundError("Invite not found");
    return await write(tx);
  }, BUSY_CAMPAIGN_MESSAGE);
}
