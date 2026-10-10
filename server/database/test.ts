/**
 * The test database, never loaded in production (index.ts picks it under NODE_ENV=test): the test's own transaction
 * once the setup sets it (`setTestDb`), the run's pool otherwise.
 */

import { drizzle as drizzlePg, type NodePgClient } from "drizzle-orm/node-postgres";
import type { PoolClient, QueryConfig, QueryResult } from "pg";

import { type Db, SCHEMA_WITH_RELATIONS, type Transaction } from "@/drizzle/database.ts";

import { createPool } from "./pool.ts";
import { clearRequestCache } from "./requestCache.ts";
import { readTestDatabaseUrl } from "./testDatabaseUrl.ts";

declare global {
  /** The test's transaction, which `db` and `withTransaction` run in once the setup sets it. */
  var __testDb: Db | null | undefined;
}

/** Read first: anything but a test database stops the run before the pool below is built. */
const connectionString = readTestDatabaseUrl();

const pool = createPool({ connectionString });

const poolDb = drizzlePg(pool as NodePgClient, { schema: SCHEMA_WITH_RELATIONS });

/** The database the code reads: the test's transaction once one is set, the run's pool otherwise. */
export const db = new Proxy(poolDb, {
  get(_target, prop) {
    return ((globalThis.__testDb ?? poolDb) as unknown as Record<string | symbol, unknown>)[prop];
  },
});

/**
 * A connection's queries, run one at a time: each is handed to the connection once the ones before it settled. A
 * test's transaction holds the shared `db` on one connection, where production spreads it over the pool's, and the
 * code reads through `db` together (a `Promise.all`, a websocket event published after its response) as a pool lets
 * it. A connection takes no query while it runs another: pg 8 queues it, warning, and pg@9 throws.
 */
class SerialQueries {
  constructor(private readonly client: PoolClient) {}

  /** The query handed in last, settled or not: the next one waits for it. */
  private last: Promise<unknown> = Promise.resolve();

  /** Runs `config` once the queries handed in before it settled. */
  run(config: QueryConfig, values?: unknown[]): Promise<QueryResult> {
    const result = this.last.then(() => this.client.query(config, values));
    this.last = result.catch(() => undefined);
    return result;
  }
}

/**
 * A database on `client`, a connection of the test's own (its transaction, a competing one), which runs its queries
 * one at a time (`SerialQueries`).
 */
export function createTestDbFromClient(client: PoolClient) {
  const queries = new SerialQueries(client);
  const serial = new Proxy(client, {
    get: (target, property, receiver) =>
      property === "query"
        ? (config: QueryConfig, values?: unknown[]) => queries.run(config, values)
        : Reflect.get(target, property, receiver),
  });
  return drizzlePg(serial, { schema: SCHEMA_WITH_RELATIONS });
}

/** A pool of connections to the test database, apart from the run's. */
export function createTestPool() {
  return createPool({ connectionString });
}

/** Runs the code's queries in `testDb`, the test's transaction (none: the run's pool). */
export function setTestDb(testDb: Db | null) {
  globalThis.__testDb = testDb;
}

export async function withTransaction<T>(callback: (tx: Transaction) => Promise<T>): Promise<T> {
  // In a test, the test's own transaction: this one is a savepoint in it, which a failure rolls back as in production.
  const result = await (globalThis.__testDb ?? poolDb).transaction(callback);
  clearRequestCache();
  return result;
}
