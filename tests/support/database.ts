import { type InferInsertModel, type InferSelectModel, sql } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";
import type { Pool, PoolClient } from "pg";

import { db, type Db } from "@/server/database/index.ts";
import { createTestDbFromClient } from "@/server/database/test.ts";
import { newTimingStore, timingStorage } from "@/server/timing.ts";

/** Whether `blocker` holds a lock the backend `pid` waits on, polled until it does (for up to a second). */
async function waitUntilBlocked(blocker: PoolClient, pid: number) {
  for (let attempt = 0; attempt < 100; attempt++) {
    const result = await blocker.query<{ waiting: boolean }>(
      "select pg_backend_pid() = ANY(pg_blocking_pids($1)) as waiting",
      [pid],
    );
    if (result.rows[0].waiting) return true;
    await Bun.sleep(10);
  }
  return false;
}

/** Inserts rows straight into `table` and returns them: test data set up in bulk, which the app writes one at a time. */
export async function insertRows<T extends PgTable>(
  table: T,
  rows: InferInsertModel<T>[],
): Promise<InferSelectModel<T>[]> {
  if (rows.length === 0) return [];
  return (await db.insert(table).values(rows).returning()) as InferSelectModel<T>[];
}

/**
 * Runs `call` on the test's connection while another transaction (a connection of `pool`) holds what `lock` takes, and
 * returns its result once that transaction rolls back. `call` must have waited on the lock: PostgreSQL shows it blocked,
 * rather than a sleep guessing it reached its critical section.
 */
export async function runWhileLocked<T>(pool: Pool, lock: (blockerDb: Db) => Promise<unknown>, call: () => Promise<T>) {
  const writer = await db.execute<{ pid: number }>(sql`select pg_backend_pid() as pid`);
  const blocker = await pool.connect();
  let pending: Promise<T> | undefined;
  try {
    await blocker.query("BEGIN");
    await lock(createTestDbFromClient(blocker));
    pending = call();
    if (!(await waitUntilBlocked(blocker, writer.rows[0].pid))) throw new Error("The call never waited on the lock");
    await blocker.query("ROLLBACK");
    return await pending;
  } finally {
    try {
      await blocker.query("ROLLBACK");
      // Drain the pending call before the test's own transaction rolls back.
      await pending;
    } finally {
      blocker.release();
    }
  }
}

/** What `run` costs the database: its queries, and the caches' hits and misses, as the request logger counts them. */
export async function measure<T>(run: () => Promise<T>) {
  const timing = newTimingStore();
  const result = await timingStorage.run(timing, run);
  return { result, timing };
}
