/**
 * TEST-ONLY DATABASE MODULE
 * Contains both test database implementation and helper functions.
 * Should NEVER be imported in production code.
 */

// Safety check
if (!process.env.DATABASE_URL?.includes("test")) {
  throw new Error(
    "FATAL: Test database module loaded with non-test DATABASE_URL. " +
    "This is a safety violation. Ensure DATABASE_URL contains 'test'."
  );
}

import * as relations from "@/drizzle/relations.ts";
import * as schema from "@/drizzle/schema.ts";
import type { ExtractTablesWithRelations } from "drizzle-orm";
import type { NodePgClient } from "drizzle-orm/node-postgres";
import { drizzle as drizzlePg } from "drizzle-orm/node-postgres";
import { type PgQueryResultHKT, type PgTransaction } from "drizzle-orm/pg-core";
import { Pool as PgPool } from "pg";

import { clearRequestCache } from "@/server/database/requestCache.ts";
import { instrumentQueries } from "@/server/timing.ts";

instrumentQueries();

declare global {
  var __getTestDb: (() => Db | null) | undefined;
}

// Route to the per-worker DB when running under `bun test --parallel`.
// BUN_TEST_WORKER_ID is 1-based. Falls back to the base URL for direct
// single-file test runs (no --parallel, no worker ID set).
const baseUrl = process.env.DATABASE_URL!;
const workerId = process.env.BUN_TEST_WORKER_ID;
const connectionString = workerId
  ? baseUrl.replace(/\/([^/?]+)(\?|$)/, `/$1_w${workerId}$2`)
  : baseUrl;
const schemaWithRelations = { ...schema, ...relations };

// Test database setup - use pg for manual transaction control
export const pool = new PgPool({ connectionString });
const _db = drizzlePg(pool as NodePgClient, { schema: schemaWithRelations });

// Test database override state
let _testDb: Db | null = null;

// Register getter on global for index.ts to use
globalThis.__getTestDb = () => _testDb;

// DATABASE IMPLEMENTATION (used by index.ts in test env)
export const db = new Proxy(_db, {
  get(_target, prop) {
    const testDb = globalThis.__getTestDb?.();
    const currentDb = testDb ?? _db;
    return (currentDb as unknown as Record<string | symbol, unknown>)[prop];
  },
});

export async function withTransaction<T>(
  callback: (tx: Transaction) => Promise<T>,
): Promise<T> {
  const testDb = globalThis.__getTestDb?.();
  if (testDb) {
    const result = await callback(testDb as Transaction);
    clearRequestCache();
    return result;
  }

  const txDb = drizzlePg(pool as NodePgClient, { schema: schemaWithRelations });
  const result = await txDb.transaction(callback);
  clearRequestCache();
  return result;
}

export type Transaction = PgTransaction<
  PgQueryResultHKT,
  typeof schemaWithRelations,
  ExtractTablesWithRelations<typeof schemaWithRelations>
>;
export type Db = typeof db | Transaction;

// HELPER FUNCTIONS (used by test setup)
export function setTestDb(testDb: Db | null) {
  _testDb = testDb;
}

export function getTestDb(): Db | null {
  return _testDb;
}

export function createTestPool() {
  return new PgPool({ connectionString });
}

export function createTestDbFromClient(client: NodePgClient) {
  return drizzlePg(client, { schema: schemaWithRelations });
}
