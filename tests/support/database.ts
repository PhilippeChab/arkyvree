import { type InferInsertModel, type InferSelectModel, sql } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";
import type { Pool, PoolClient } from "pg";

import type { Db } from "@/drizzle/database.ts";
import { db } from "@/server/database/index.ts";
import { createTestDbFromClient } from "@/server/database/test.ts";
import { newTimingStore, timingStorage } from "@/server/timing.ts";

/**
 * What `runWhileLocked` and `runWhileCommitting` run: what `lock` takes, held in another transaction (a connection of
 * `pool`) until `call` waits on it, then `onRelease`, then that transaction's `end`, and what `call` answers.
 */
async function holdUntilWaited<T>(
  pool: Pool,
  lock: (blockerDb: Db) => Promise<unknown>,
  call: () => Promise<T>,
  onRelease: (held: { blockerDb: Db; waiting: string }) => unknown,
  end: "COMMIT" | "ROLLBACK",
) {
  const writer = await db.execute<{ pid: number }>(sql`select pg_backend_pid() as pid`);
  const blocker = await pool.connect();
  let pending: Promise<T> | undefined;
  try {
    await blocker.query("BEGIN");
    await lock(createTestDbFromClient(blocker));
    pending = call();
    if (!(await waitUntilBlocked(blocker, writer.rows[0].pid))) throw new Error("The call never waited on the lock");
    const activity = await blocker.query<{ query: string }>("select query from pg_stat_activity where pid = $1", [
      writer.rows[0].pid,
    ]);
    await onRelease({ blockerDb: createTestDbFromClient(blocker), waiting: activity.rows[0].query });
    await blocker.query(end);
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

/** Whether `query` answers that the backend `pid` waits, asked through `client` until it does (for up to a second). */
async function pollUntilWaiting(client: PoolClient, query: string, pid: number) {
  for (let attempt = 0; attempt < 100; attempt++) {
    const result = await client.query<{ waiting: boolean }>(query, [pid]);
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

/** What `run` costs the database: its queries, and the caches' hits and misses, as the request logger counts them. */
export async function measure<T>(run: () => Promise<T>) {
  const timing = newTimingStore();
  const result = await timingStorage.run(timing, run);
  return { result, timing };
}

/**
 * Runs `call` as `runWhileLocked` does, but the transaction that holds the lock commits: what `lock` and `onCommit`
 * (run once `call` waits, with the same `held`) write is there once `call` goes on, as another write's change is once
 * it commits. Rows it commits outlive the test: a test deletes them itself (`CommittedUsers`).
 */
export async function runWhileCommitting<T>(
  pool: Pool,
  lock: (blockerDb: Db) => Promise<unknown>,
  call: () => Promise<T>,
  onCommit: (held: { blockerDb: Db; waiting: string }) => unknown = () => undefined,
) {
  return await holdUntilWaited(pool, lock, call, onCommit, "COMMIT");
}

/**
 * Runs `call` on the test's connection while another transaction (a connection of `pool`) holds what `lock` takes, and
 * returns its result once that transaction rolls back. `call` must have waited on the lock: PostgreSQL shows it blocked,
 * rather than a sleep guessing it reached its critical section. `onRelease` runs once `call` waits, just before that
 * transaction rolls back, with what still holds the lock (`blockerDb`) and what waits on it (`waiting`: the statement
 * `call` waits at): what `call` did before it, it did while the lock was held.
 */
export async function runWhileLocked<T>(
  pool: Pool,
  lock: (blockerDb: Db) => Promise<unknown>,
  call: () => Promise<T>,
  onRelease: (held: { blockerDb: Db; waiting: string }) => unknown = () => undefined,
) {
  return await holdUntilWaited(pool, lock, call, onRelease, "ROLLBACK");
}

/** Whether `blocker` holds a lock the backend `pid` waits on, polled until it does (for up to a second). */
export async function waitUntilBlocked(blocker: PoolClient, pid: number) {
  return await pollUntilWaiting(blocker, "select pg_backend_pid() = ANY(pg_blocking_pids($1)) as waiting", pid);
}

/**
 * Whether the backend `pid` waits on a lock, whoever holds it, or stands in the queue for it (a second waiter is blocked
 * by the first, not by the lock's holder), polled through `client` until it does (for up to a second).
 */
export async function waitUntilWaiting(client: PoolClient, pid: number) {
  return await pollUntilWaiting(client, "select cardinality(pg_blocking_pids($1)) > 0 as waiting", pid);
}
