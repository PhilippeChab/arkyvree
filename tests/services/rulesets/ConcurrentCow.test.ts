import { afterAll, expect, test } from "bun:test";

import { SEED_USER_ID } from "@/database/seeds/users.ts";
import { db } from "@/server/database/index.ts";
import { createTestDbFromClient, createTestPool } from "@/server/database/test.ts";
import { EntitySnapshots, Feats } from "@/server/repositories/index.ts";
import { runWhileLocked } from "@/tests/support/database.ts";
import { copyEntity, createSeededTestRuleset } from "@/tests/support/rulesets.ts";
import { getSeedCtx } from "@/tests/support/seed.ts";

const pool = createTestPool();
afterAll(() => pool.end());

test("COW waits for a competing copy transaction and continues after rollback", async () => {
  const seed = await getSeedCtx();
  const fork = await createSeededTestRuleset(SEED_USER_ID);
  const sourceId = seed.featMap.Toughness;
  const copied = await runWhileLocked(
    pool,
    (blockerDb) => EntitySnapshots.lock(blockerDb, { rulesetId: fork.id, sourceEntityId: sourceId }),
    () => copyEntity(db, "feats", sourceId, fork.id, [seed.rulesetId], []),
  );
  expect(copied.id).not.toBe(sourceId);
  expect((await copyEntity(db, "feats", sourceId, fork.id, [seed.rulesetId], [])).id).toBe(copied.id);
  expect(await EntitySnapshots.findMany(db, { rulesetId: fork.id })).toHaveLength(1);
  expect((await Feats.findOne(db, { id: sourceId }))?.rulesetId).toBe(seed.rulesetId);
});

test("copy locks do not block other sources or other forks", async () => {
  const forkId = crypto.randomUUID();
  const sourceId = crypto.randomUUID();
  await EntitySnapshots.lock(db, { rulesetId: forkId, sourceEntityId: sourceId });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL lock_timeout = '500ms'");
    const otherDb = createTestDbFromClient(client);
    await EntitySnapshots.lock(otherDb, { rulesetId: forkId, sourceEntityId: crypto.randomUUID() });
    await EntitySnapshots.lock(otherDb, { rulesetId: crypto.randomUUID(), sourceEntityId: sourceId });
  } finally {
    await client.query("ROLLBACK");
    client.release();
  }
});

test("a tombstoned copy can be recreated without duplicating snapshots", async () => {
  const seed = await getSeedCtx();
  const fork = await createSeededTestRuleset(SEED_USER_ID);
  const sourceId = seed.featMap.Toughness;
  const first = await copyEntity(db, "feats", sourceId, fork.id, [seed.rulesetId], []);
  await Feats.delete(db, { id: first.id });
  const second = await copyEntity(db, "feats", sourceId, fork.id, [seed.rulesetId], []);
  expect(second.id).not.toBe(first.id);
  const snapshots = await EntitySnapshots.findMany(db, { rulesetId: fork.id });
  expect(snapshots).toHaveLength(1);
  expect(snapshots[0].forkedEntityId).toBe(second.id);
});
