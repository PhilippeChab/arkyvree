import { afterAll, expect, test } from "bun:test";
import { sql } from "drizzle-orm";
import { getSeedContext, SEED_USER_ID } from "@/database/seeds/helpers.ts";
import { db } from "@/server/database/index.ts";
import { createTestDbFromClient, createTestPool } from "@/server/database/test.ts";
import { EntitySnapshots, Feats } from "@/server/repositories/index.ts";
import { cowEntity } from "@/server/services/rulesets/cow.ts";
import { createSeededTestRuleset } from "@/tests/helpers.ts";

const pool = createTestPool();
afterAll(() => pool.end());

test("COW waits for a competing copy transaction and continues after rollback", async () => {
  const seed = await getSeedContext(db);
  const fork = await createSeededTestRuleset(SEED_USER_ID);
  const sourceId = seed.featMap.Toughness;
  const writer = await db.execute<{ pid: number }>(sql`select pg_backend_pid() as pid`);
  const blocker = await pool.connect();
  let copying: ReturnType<typeof cowEntity> | undefined;
  try {
    await blocker.query("BEGIN");
    const blockerDb = createTestDbFromClient(blocker);
    await EntitySnapshots.lockForCopy(blockerDb, fork.id, sourceId);
    copying = cowEntity(db, "feats", sourceId, fork.id, [seed.rulesetId], []);
    // Observe an actual PostgreSQL wait, rather than relying on a sleep to
    // guess whether the competing call has reached its critical section.
    let waiting = false;
    for (let attempt = 0; attempt < 100; attempt++) {
      const result = await blocker.query<{ waiting: boolean }>(
        "select pg_backend_pid() = ANY(pg_blocking_pids($1)) as waiting", [writer.rows[0].pid],
      );
      if (result.rows[0].waiting) { waiting = true; break; }
      await Bun.sleep(10);
    }
    expect(waiting).toBe(true);
    await blocker.query("ROLLBACK");
    const copied = await copying;
    expect(copied.id).not.toBe(sourceId);
    expect((await cowEntity(db, "feats", sourceId, fork.id, [seed.rulesetId], [])).id).toBe(copied.id);
    expect(await EntitySnapshots.findByRulesetId(db, { rulesetId: fork.id })).toHaveLength(1);
    expect((await Feats.findOne(db, { id: sourceId }))?.rulesetId).toBe(seed.rulesetId);
  } finally {
    try {
      await blocker.query("ROLLBACK");
      // Drain the pending call before the global test transaction rolls back.
      await copying;
    } finally {
      blocker.release();
    }
  }
});

test("copy locks do not block other sources or other forks", async () => {
  const forkId = crypto.randomUUID();
  const sourceId = crypto.randomUUID();
  await EntitySnapshots.lockForCopy(db, forkId, sourceId);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL lock_timeout = '500ms'");
    const otherDb = createTestDbFromClient(client);
    await EntitySnapshots.lockForCopy(otherDb, forkId, crypto.randomUUID());
    await EntitySnapshots.lockForCopy(otherDb, crypto.randomUUID(), sourceId);
  } finally {
    await client.query("ROLLBACK");
    client.release();
  }
});

test("a tombstoned copy can be recreated without duplicating snapshots", async () => {
  const seed = await getSeedContext(db);
  const fork = await createSeededTestRuleset(SEED_USER_ID);
  const sourceId = seed.featMap.Toughness;
  const first = await cowEntity(db, "feats", sourceId, fork.id, [seed.rulesetId], []);
  await Feats.delete(db, { id: first.id });
  const second = await cowEntity(db, "feats", sourceId, fork.id, [seed.rulesetId], []);
  expect(second.id).not.toBe(first.id);
  const snapshots = await EntitySnapshots.findByRulesetId(db, { rulesetId: fork.id });
  expect(snapshots).toHaveLength(1);
  expect(snapshots[0].forkedEntityId).toBe(second.id);
});
