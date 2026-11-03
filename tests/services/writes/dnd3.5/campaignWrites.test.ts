import { afterAll, expect, test } from "bun:test";

import { SEED_USER_ID } from "@/scripts/db/seeds/users.ts";
import { db } from "@/server/database/index.ts";
import { createTestDbFromClient, createTestPool } from "@/server/database/test.ts";
import { UnauthorizedError } from "@/server/errors/index.ts";
import { Campaigns, Invites, Locks, Players } from "@/server/repositories/index.ts";
import { AccountService } from "@/server/services/authentication/account/index.ts";
import { CampaignCharactersService } from "@/server/services/campaigns/characters/index.ts";
import { CampaignsService } from "@/server/services/campaigns/index.ts";
import { CampaignPlayersService } from "@/server/services/campaigns/players/index.ts";
import { BUSY_CAMPAIGN_MESSAGE } from "@/server/services/writes/index.ts";
import { CommittedUsers } from "@/tests/support/CommittedUsers.ts";
import { runWhileCommitting, runWhileLocked } from "@/tests/support/database.ts";
import { findSeededCharacter, getSeedCtx, uniqueId } from "@/tests/support/seed.ts";
import { makeSession } from "@/tests/support/users.ts";

/**
 * What a campaign's write waits at while another holds the campaign's row: its own lock of it, read by its start, as
 * Postgres keeps a long statement's first kilobyte alone.
 */
const CAMPAIGN_LOCK = /^select "deleted_at", "id" from "campaign"\."campaigns"/;

/** The campaigns the probes committed, which another connection sees: deleted once every test rolled back. */
const committed: string[] = [];

const pool = createTestPool();

/** The demo users the probes committed, deleted after the campaigns. */
const users = new CommittedUsers(pool);

/**
 * A campaign of the seeded ruleset, its Game Master the seed user's, committed through the probes' pool: one another
 * connection sees, so it can hold its row, as no campaign the seed makes is there to hold. Deleted after the file's
 * tests (`afterAll`), whose transactions hold their own locks of it until they roll back.
 */
async function commitCampaign(rulesetId?: string) {
  const client = await pool.connect();
  try {
    const committedDb = createTestDbFromClient(client);
    const [campaign] = await Campaigns.create(committedDb, {
      name: `Locked Campaign ${uniqueId()}`,
      rulesetId: rulesetId ?? (await getSeedCtx()).rulesetId,
    });
    committed.push(campaign.id);
    await Players.create(committedDb, { campaignId: campaign.id, role: "Game Master", userId: SEED_USER_ID });
    return campaign;
  } finally {
    client.release();
  }
}

afterAll(async () => {
  const client = await pool.connect();
  try {
    for (const id of committed) await Campaigns.delete(createTestDbFromClient(client), { id });
  } finally {
    client.release();
  }
  await users.deleteAll();
  await pool.end();
});

test("a campaign's write waits at its own lock of the campaign's row", async () => {
  const campaign = await commitCampaign();
  const name = `Waited ${uniqueId()}`;
  let waiting = "";
  const updated = await runWhileLocked(
    pool,
    (blockerDb) => Locks.lockCampaigns(blockerDb, { ids: [campaign.id] }, "no key update"),
    () => CampaignsService.updateCampaign(makeSession(), campaign.id, { name }),
    (held) => void (waiting = held.waiting),
  );
  expect(updated.name).toBe(name);
  expect(waiting).toMatch(CAMPAIGN_LOCK);
});

test("two Game Masters' removals of each other take turns: the second, once the first commits, is the last one's", async () => {
  const campaign = await commitCampaign();
  const { id: userId } = await users.commit("locked");
  const client = await pool.connect();
  let other: Awaited<ReturnType<typeof Players.create>>;
  try {
    other = await Players.create(createTestDbFromClient(client), {
      campaignId: campaign.id,
      role: "Game Master",
      userId,
    });
  } finally {
    client.release();
  }
  const mine = (await Players.findOne(db, { campaignId: campaign.id, userId: SEED_USER_ID }))!;
  // The other Game Master's removal holds the campaign: the seed user's own leave waits for it, then counts again
  const removal = runWhileCommitting(
    pool,
    (blockerDb) => Locks.lockCampaigns(blockerDb, { ids: [campaign.id] }, "no key update"),
    () => CampaignPlayersService.removePlayer(makeSession(), campaign.id, mine.id),
    ({ blockerDb }) => Players.delete(blockerDb, { id: other[0].id }),
  );
  expect(removal).rejects.toMatchObject({ code: 409, message: "Cannot remove the last Game Master from a campaign" });
});

test("a character's link holds the character's row alone: a second link of it waits for the first", async () => {
  // Seeded characters: ones another connection sees, so it can hold their rows. Held shared: only a link that takes
  // the row alone waits on it
  const seeded = await findSeededCharacter("Fenn Ashwalker");
  const campaign = await commitCampaign(seeded.rulesetId);
  const linked = await runWhileLocked(
    pool,
    (blockerDb) => Locks.lockCharacters(blockerDb, { ids: [seeded.id] }, "share"),
    () => CampaignCharactersService.linkCharacter(makeSession(), campaign.id, seeded.id, "Public"),
  );
  expect(linked.characterId).toBe(seeded.id);
});

test("a campaign's write that waits past its lock wait is refused as busy, and writes nothing", async () => {
  const campaign = await commitCampaign();
  const blocker = await pool.connect();
  try {
    await blocker.query("BEGIN");
    await Locks.lockCampaigns(createTestDbFromClient(blocker), { ids: [campaign.id] }, "no key update");
    expect(CampaignsService.updateCampaign(makeSession(), campaign.id, { name: "Refused" })).rejects.toMatchObject({
      code: 409,
      message: BUSY_CAMPAIGN_MESSAGE,
      name: "BusyError",
    });
  } finally {
    await blocker.query("ROLLBACK");
    blocker.release();
  }
  expect((await Campaigns.findOne(db, { id: campaign.id }))?.name).toBe(campaign.name);
}, 15_000);

test("a campaign's creation waits for a write to its ruleset, which it holds shared", async () => {
  const { rulesetId } = await getSeedCtx();
  const name = `Waited ${uniqueId()}`;
  const { campaign } = await runWhileLocked(
    pool,
    (blockerDb) => Locks.lockRulesetContent(blockerDb, rulesetId),
    () => CampaignsService.createCampaign(makeSession(), { name, rulesetId }),
  );
  expect(campaign.name).toBe(name);
});

test("a campaign's creation that waits for its creator's account's deletion is refused, and makes no campaign", async () => {
  const { rulesetId } = await getSeedCtx();
  const user = await users.commit("locked");
  const name = `Refused ${uniqueId()}`;
  // The account's deletion holds its row, then archives it and commits
  const creation = users.runDuringDeletion(user.id, () =>
    CampaignsService.createCampaign(makeSession(user.id), { name, rulesetId }),
  );
  expect(creation).rejects.toEqual(new UnauthorizedError("Invalid session"));
  expect(await Campaigns.count(db, { userId: user.id })).toBe(0);
});

test("an account's deletion that waits for another deletion of it is refused as its session is", async () => {
  const user = await users.commit("locked");
  // Another tab's deletion holds the account, then archives it and commits
  const deletion = users.runDuringDeletion(user.id, () =>
    AccountService.deleteAccount(makeSession(user.id), "password1234"),
  );
  expect(deletion).rejects.toEqual(new UnauthorizedError("Invalid session"));
});

test("an account's deletion waits for a write to a campaign its address has an unclaimed invite in", async () => {
  const user = await users.commit("locked");
  const campaign = await commitCampaign();
  const client = await pool.connect();
  try {
    const committedDb = createTestDbFromClient(client);
    const [slot] = await Players.create(committedDb, { campaignId: campaign.id, role: "Player Character" });
    await Invites.create(committedDb, { email: user.emailAddress, playerId: slot.id });
  } finally {
    client.release();
  }
  let waiting = "";
  const deleted = await runWhileLocked(
    pool,
    (blockerDb) => Locks.lockCampaigns(blockerDb, { ids: [campaign.id] }, "no key update"),
    () => AccountService.deleteAccount(makeSession(user.id), "password1234"),
    (held) => void (waiting = held.waiting),
  );
  expect(deleted).toEqual({ success: true });
  expect(waiting).toMatch(CAMPAIGN_LOCK);
});

test("an account's deletion waits for a write to a campaign it holds a seat in, before it archives the seat", async () => {
  const user = await users.commit("locked");
  const campaign = await commitCampaign();
  const client = await pool.connect();
  try {
    await Players.create(createTestDbFromClient(client), {
      campaignId: campaign.id,
      role: "Player Character",
      userId: user.id,
    });
  } finally {
    client.release();
  }
  let waiting = "";
  const deleted = await runWhileLocked(
    pool,
    (blockerDb) => Locks.lockCampaigns(blockerDb, { ids: [campaign.id] }, "no key update"),
    () => AccountService.deleteAccount(makeSession(user.id), "password1234"),
    (held) => void (waiting = held.waiting),
  );
  expect(deleted).toEqual({ success: true });
  expect(waiting).toMatch(CAMPAIGN_LOCK);
});
