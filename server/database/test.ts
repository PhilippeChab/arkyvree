/**
 * The test database, never loaded in production (index.ts picks it under NODE_ENV=test): the test's own transaction
 * once the setup starts one (`startTestTransaction`, `setTestDb`), the run's pool, read-only, between the setup's
 * tests, and the run's pool otherwise (a server on a test database: the e2e run's).
 */

import { drizzle as drizzlePg, type NodePgClient } from "drizzle-orm/node-postgres";
import type { PoolClient, QueryConfig, QueryResult } from "pg";

import { type Db, SCHEMA_WITH_RELATIONS, type Transaction } from "@/drizzle/database.ts";

import { createPool } from "./pool.ts";
import { clearRequestCache } from "./requestCache.ts";
import { readTestDatabaseUrl } from "./testDatabaseUrl.ts";

declare global {
  /** What `db` and `withTransaction` run in once the setup sets it: a test's transaction, or the run's pool, read-only. */
  var __testDb: Db | undefined;
}

/** Read first: anything but a test database stops the run before the pool below is built. */
const connectionString = readTestDatabaseUrl();

/** What a test's connection refuses a query with once it rolled the test back. */
const ENDED_TEST_MESSAGE =
  "The test ended: its connection rolled it back, and runs nothing it hands in after (past its timeout, or in work it never awaited)";

const pool = createPool({ connectionString });

const poolDb = drizzlePg(pool as NodePgClient, { schema: SCHEMA_WITH_RELATIONS });

/**
 * The run's pool, read-only: the code's database between the setup's tests, where nothing rolls back what it writes,
 * so a write there (of a test that outlived its end) is refused instead of committed.
 */
const readOnlyPoolDb = drizzlePg(
  createPool({ connectionString, options: "-c default_transaction_read_only=on" }) as NodePgClient,
  { schema: SCHEMA_WITH_RELATIONS },
);

/** The database the code reads: the one the setup sets (`setTestDb`), the run's pool otherwise. */
export const db = new Proxy(poolDb, {
  get(_target, prop) {
    return ((globalThis.__testDb ?? poolDb) as unknown as Record<string | symbol, unknown>)[prop];
  },
});

/** A database on `client` whose queries run through `queries`, one at a time. */
function serialDb(client: PoolClient, queries: SerialQueries) {
  const serial = new Proxy(client, {
    get: (target, property, receiver) =>
      property === "query"
        ? (config: QueryConfig, values?: unknown[]) => queries.run(config, values)
        : Reflect.get(target, property, receiver),
  });
  return drizzlePg(serial, { schema: SCHEMA_WITH_RELATIONS });
}

/**
 * A connection's queries, run one at a time: each is handed to the connection once the ones before it settled. A
 * test's transaction holds the shared `db` on one connection, where production spreads it over the pool's, and the
 * code reads through `db` together (a `Promise.all`, a websocket event published after its response) as a pool lets
 * it. A connection takes no query while it runs another: pg 8 queues it, warning, and pg@9 throws. Its last query
 * (`end`: a test's rollback) closes it: it refuses every query handed in after it, which would run outside the test's
 * transaction.
 */
class SerialQueries {
  constructor(private readonly client: PoolClient) {}

  /** Whether its last query was handed in: it refuses any other. */
  private ended = false;

  /** The query handed in last, settled or not: the next one waits for it. */
  private last: Promise<unknown> = Promise.resolve();

  /** Runs `text`, the connection's last query, once the ones handed in before it settled, and refuses any after it. */
  end(text: string) {
    const result = this.run({ text });
    this.ended = true;
    return result;
  }

  /** Runs `config` once the queries handed in before it settled: refused once the connection ended. */
  run(config: QueryConfig, values?: unknown[]): Promise<QueryResult> {
    if (this.ended) return Promise.reject(new Error(ENDED_TEST_MESSAGE));
    const result = this.last.then(() => this.client.query(config, values));
    this.last = result.catch(() => undefined);
    return result;
  }
}

/**
 * A database on `client`, a connection of the test's own (a competing transaction's), which runs its queries one at a
 * time (`SerialQueries`).
 */
export function createTestDbFromClient(client: PoolClient) {
  return serialDb(client, new SerialQueries(client));
}

/** A pool of connections to the test database, apart from the run's. */
export function createTestPool() {
  return createPool({ connectionString });
}

/**
 * Runs the code's queries in `testDb`, a test's transaction, or, with none (`null`: before and between the setup's
 * tests), on the run's pool, read-only.
 */
export function setTestDb(testDb: Db | null) {
  globalThis.__testDb = testDb ?? readOnlyPoolDb;
}

/**
 * Starts a test's transaction on `client`, a connection of the setup's: drizzle's (`tx`), so a transaction the code
 * opens in it is a savepoint, on a connection that runs its queries one at a time. `end` rolls it back as the last
 * query the connection runs for the test: what the test hands it after (code that outlives the test: past its timeout,
 * or in work it never awaited) is refused, where it would run outside the transaction, and commit.
 */
export async function startTestTransaction(client: PoolClient) {
  const queries = new SerialQueries(client);
  const started = Promise.withResolvers<Transaction>();
  const ended = Promise.withResolvers<void>();
  const settled = serialDb(client, queries)
    .transaction(async (tx) => {
      started.resolve(tx);
      await ended.promise;
      // Refused, as all after `end`'s rollback: drizzle's own, which ends the transaction this callback holds open
      tx.rollback();
    })
    // Its `begin` failing, which the test can't run without; once it started, the refusal of drizzle's rollback
    .catch(started.reject);
  return {
    tx: await started.promise,
    async end() {
      try {
        await queries.end("ROLLBACK");
      } finally {
        ended.resolve();
        await settled;
      }
    },
  };
}

export async function withTransaction<T>(callback: (tx: Transaction) => Promise<T>): Promise<T> {
  // In a test, the test's own transaction: this one is a savepoint in it, which a failure rolls back as in production.
  const result = await (globalThis.__testDb ?? poolDb).transaction(callback);
  clearRequestCache();
  return result;
}
