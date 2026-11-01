import { afterAll, expect, test } from "bun:test";

import { sql } from "drizzle-orm";

import { SEED_USER_ID } from "@/scripts/db/seeds/users.ts";
import { db } from "@/server/database/index.ts";
import { createTestDbFromClient, createTestPool } from "@/server/database/test.ts";
import { Campaigns, Characters, Players, Rulesets } from "@/server/repositories/index.ts";
import { BUSY_CAMPAIGN_MESSAGE } from "@/server/services/campaigns/campaignWrites.ts";
import { CampaignCharactersService } from "@/server/services/campaigns/characters/index.ts";
import { CampaignsService } from "@/server/services/campaigns/index.ts";
import { CampaignPlayersService } from "@/server/services/campaigns/players/index.ts";
import { runWhileLocked, waitUntilBlocked } from "@/tests/support/database.ts";
import { findSeededCharacter, getSeedCtx, uniqueId } from "@/tests/support/seed.ts";
import { makeSession } from "@/tests/support/users.ts";

/** What a campaign's write waits at while another holds the campaign's row: its own lock of it. */
const CAMPAIGN_LOCK = /from "campaign"\."campaigns".*for no key update/is;

/** The campaigns the probes committed, which another connection sees: deleted once every test rolled back. */
const committed: string[] = [];

const pool = createTestPool();

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
  await pool.end();
});

test("a campaign's write waits at its own lock of the campaign's row", async () => {
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

test("two Game Masters' removals of each other take turns: the second, once the first commits, is the last one's", async () => {
  const campaign = await commitCampaign();
  const client = await pool.connect();
  const other = await Players.create(createTestDbFromClient(client), { campaignId: campaign.id, role: "Game Master" });
  client.release();
  const mine = (await Players.findOne(db, { campaignId: campaign.id, userId: SEED_USER_ID }))!;
  const writer = (await db.execute<{ pid: number }>(sql`select pg_backend_pid() as pid`)).rows[0].pid;
  const blocker = await pool.connect();
  let removal: Promise<unknown> | undefined;
  try {
    // The other Game Master's removal holds the campaign: the seed user's own leave waits for it, then counts again
    await blocker.query("BEGIN");
    await Campaigns.lock(createTestDbFromClient(blocker), { id: campaign.id }, "no key update");
    removal = CampaignPlayersService.removePlayer(makeSession(), campaign.id, mine.id).catch((error: Error) => error);
    expect(await waitUntilBlocked(blocker, writer)).toBe(true);
    await Players.delete(createTestDbFromClient(blocker), { id: other[0].id });
    await blocker.query("COMMIT");
    expect(await removal).toMatchObject({ code: 409, message: "Cannot remove the last Game Master from a campaign" });
  } finally {
    await blocker.query("ROLLBACK");
    await removal;
    blocker.release();
  }
});

test("a character's link holds the character's row alone, so a second link of it waits and sees the first", async () => {
  // Seeded characters: ones another connection sees, so it can hold their rows. Held shared: only a link that takes
  // the row alone waits on it
  const seeded = await findSeededCharacter("Fenn Ashwalker");
  const campaign = await commitCampaign(seeded.rulesetId);
  const linked = await runWhileLocked(
    pool,
    (blockerDb) => Characters.lock(blockerDb, { id: seeded.id }, "share"),
    () => CampaignCharactersService.linkCharacter(makeSession(), campaign.id, seeded.id, "Public"),
  );
  expect(linked.characterId).toBe(seeded.id);
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
