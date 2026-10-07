/**
 * The test database, never loaded in production (index.ts picks it under NODE_ENV=test): the test's own transaction
 * once the setup sets it (`setTestDb`), the run's pool otherwise.
 */

import type { ExtractTablesWithRelations } from "drizzle-orm";
import { drizzle as drizzlePg, type NodePgClient } from "drizzle-orm/node-postgres";
import { type PgQueryResultHKT, type PgTransaction } from "drizzle-orm/pg-core";

import * as relations from "@/drizzle/relations.ts";
import * as schema from "@/drizzle/schema.ts";

import { createPool } from "./pool.ts";
import { clearRequestCache } from "./requestCache.ts";
import { readTestDatabaseUrl } from "./testDatabaseUrl.ts";

declare global {
  /** The test's transaction, which `db` and `withTransaction` run in once the setup sets it. */
  var __testDb: Db | null | undefined;
}

type Db = typeof db | Transaction;

type Transaction = PgTransaction<
  PgQueryResultHKT,
  typeof schemaWithRelations,
  ExtractTablesWithRelations<typeof schemaWithRelations>
>;

/** Read first: anything but a test database stops the run before the pool below is built. */
const connectionString = readTestDatabaseUrl();

const pool = createPool({ connectionString });

const schemaWithRelations = { ...schema, ...relations };

const poolDb = drizzlePg(pool as NodePgClient, { schema: schemaWithRelations });

/** The database the code reads: the test's transaction once one is set, the run's pool otherwise. */
export const db = new Proxy(poolDb, {
  get(_target, prop) {
    return ((globalThis.__testDb ?? poolDb) as unknown as Record<string | symbol, unknown>)[prop];
  },
});

/** A database on `client`, a connection of the test's own (a competing transaction). */
export function createTestDbFromClient(client: NodePgClient) {
  return drizzlePg(client, { schema: schemaWithRelations });
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
