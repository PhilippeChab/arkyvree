import { afterAll, expect, test } from "bun:test";

import { SEED_USER_ID } from "@/scripts/db/seeds/users.ts";
import { db } from "@/server/database/index.ts";
import { createTestDbFromClient, createTestPool } from "@/server/database/test.ts";
import { Campaigns, Players, Rulesets } from "@/server/repositories/index.ts";
import { BUSY_CAMPAIGN_MESSAGE } from "@/server/services/campaigns/campaignWrites.ts";
import { CampaignsService } from "@/server/services/campaigns/index.ts";
import { CampaignPlayersService } from "@/server/services/campaigns/players/index.ts";
import { runWhileLocked } from "@/tests/support/database.ts";
import { getSeedCtx, uniqueId } from "@/tests/support/seed.ts";
import { makeSession } from "@/tests/support/users.ts";

/** What a campaign's write waits at while another holds the campaign's row: its own lock of it, before it reads. */
const CAMPAIGN_LOCK = /from "campaign"\."campaigns".*for no key update/is;

/** The campaigns the probes committed, which another connection sees: deleted once every test rolled back. */
const committed: string[] = [];

const pool = createTestPool();

/**
 * A campaign of the seeded ruleset, its Game Master the seed user's, committed through the probes' pool: one another
 * connection sees, so it can hold its row, as no campaign the seed makes is there to hold. Deleted after the file's
 * tests (`afterAll`), whose transactions hold their own locks of it until they roll back.
 */
async function commitCampaign() {
  const client = await pool.connect();
  try {
    const committedDb = createTestDbFromClient(client);
    const [campaign] = await Campaigns.create(committedDb, {
      name: `Locked Campaign ${uniqueId()}`,
      rulesetId: (await getSeedCtx()).rulesetId,
    });
    await Players.create(committedDb, { campaignId: campaign.id, role: "Game Master", userId: SEED_USER_ID });
    committed.push(campaign.id);
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
  await pool.end();
});

test("a campaign's write waits at its own lock of the campaign's row, before it reads it", async () => {
  const campaign = await commitCampaign();
  const name = `Waited ${uniqueId()}`;
  let waiting = "";
  const updated = await runWhileLocked(
    pool,
    (blockerDb) => Campaigns.lock(blockerDb, { id: campaign.id }, "no key update"),
    () => CampaignsService.updateCampaign(makeSession(), campaign.id, { name }),
    (held) => void (waiting = held.waiting),
  );
  expect(updated.name).toBe(name);
  expect(waiting).toMatch(CAMPAIGN_LOCK);
});

test("a player's removal waits for another write to the campaign: two Game Masters' removals of each other take turns", async () => {
  const campaign = await commitCampaign();
  const [seat] = await Players.create(db, { campaignId: campaign.id, role: "Player Character" });
  let waiting = "";
  const removed = await runWhileLocked(
    pool,
    (blockerDb) => Campaigns.lock(blockerDb, { id: campaign.id }, "no key update"),
    () => CampaignPlayersService.removePlayer(makeSession(), campaign.id, seat.id),
    (held) => void (waiting = held.waiting),
  );
  expect(removed.id).toBe(seat.id);
  expect(waiting).toMatch(CAMPAIGN_LOCK);
});

test("a campaign's write that waits past its lock wait is refused as busy, and writes nothing", async () => {
  const campaign = await commitCampaign();
  const blocker = await pool.connect();
  try {
    await blocker.query("BEGIN");
    await Campaigns.lock(createTestDbFromClient(blocker), { id: campaign.id }, "no key update");
    expect(CampaignsService.updateCampaign(makeSession(), campaign.id, { name: "Refused" })).rejects.toMatchObject({
      code: 409,
      message: BUSY_CAMPAIGN_MESSAGE,
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
    (blockerDb) => Rulesets.lockContent(blockerDb, { id: rulesetId }),
    () => CampaignsService.createCampaign(makeSession(), { name, rulesetId }),
  );
  expect(campaign.name).toBe(name);
});
