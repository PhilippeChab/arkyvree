import { afterAll, expect, test } from "bun:test";
import { sql } from "drizzle-orm";
import { getSeedContext } from "@/database/seeds/helpers.ts";
import { db } from "@/server/database/index.ts";
import { createTestDbFromClient, createTestPool } from "@/server/database/test.ts";
import { Feats } from "@/server/repositories/index.ts";
import { lockEntityForMutation } from "@/server/services/rulesets/cow.ts";

const pool = createTestPool();
afterAll(() => pool.end());

test("owner mutation waits for a competing transaction and acquires the row after rollback", async () => {
  const seed = await getSeedContext(db);
  const writer = await db.execute<{ pid: number }>(sql`select pg_backend_pid() as pid`);
  const blocker = await pool.connect();
  let locking: Promise<void> | undefined;
  try {
    await blocker.query("BEGIN");
    expect(await Feats.lockById(createTestDbFromClient(blocker), seed.featMap.Toughness)).toBe(true);
    locking = lockEntityForMutation(db, "feats", seed.featMap.Toughness);
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
    await locking;
  } finally {
    try { await blocker.query("ROLLBACK"); await locking; }
    finally { blocker.release(); }
  }
});

test("owner locks leave other entities independent and shared copy reads compatible", async () => {
  const seed = await getSeedContext(db);
  const otherId = Object.values(seed.featMap).find(id => id !== seed.featMap.Toughness)!;
  await lockEntityForMutation(db, "feats", seed.featMap.Toughness);
  expect(await Feats.lockById(db, otherId, "share")).toBe(true);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL lock_timeout = '500ms'");
    const other = createTestDbFromClient(client);
    expect(await Feats.lockById(other, otherId, "share")).toBe(true);
  } finally { await client.query("ROLLBACK"); client.release(); }
});

test("a missing owner is rejected before customization writes", async () => {
  await expect(lockEntityForMutation(db, "feats", crypto.randomUUID())).rejects.toThrow("no longer exists");
});
