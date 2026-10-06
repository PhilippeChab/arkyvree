/**
 * TEST-ONLY DATABASE MODULE
 * Contains both test database implementation and helper functions.
 * Should NEVER be imported in production code.
 */

import type { ExtractTablesWithRelations } from "drizzle-orm";
import type { NodePgClient } from "drizzle-orm/node-postgres";
import { drizzle as drizzlePg } from "drizzle-orm/node-postgres";
import { type PgQueryResultHKT, type PgTransaction } from "drizzle-orm/pg-core";
import { Pool as PgPool } from "pg";

import * as relations from "@/drizzle/relations.ts";
import * as schema from "@/drizzle/schema.ts";
import { clearRequestCache } from "@/server/database/requestCache.ts";
import { instrumentQueries } from "@/server/timing.ts";

import { readTestDatabaseUrl } from "./testDatabaseUrl.ts";

declare global {
  var __getTestDb: (() => Db | null) | undefined;
}

type Transaction = PgTransaction<
  PgQueryResultHKT,
  typeof schemaWithRelations,
  ExtractTablesWithRelations<typeof schemaWithRelations>
>;

type Db = typeof db | Transaction;

// Read first: anything but a test database stops the run before the pool below is built.
const connectionString = readTestDatabaseUrl();
const schemaWithRelations = { ...schema, ...relations };

// Test database setup - use pg for manual transaction control
const pool = new PgPool({ connectionString });
const _db = drizzlePg(pool as NodePgClient, { schema: schemaWithRelations });

// Test database override state
let _testDb: Db | null = null;

// DATABASE IMPLEMENTATION (used by index.ts in test env)
export const db = new Proxy(_db, {
  get(_target, prop) {
    const testDb = globalThis.__getTestDb?.();
    const currentDb = testDb ?? _db;
    return (currentDb as unknown as Record<string | symbol, unknown>)[prop];
  },
});

export function createTestDbFromClient(client: NodePgClient) {
  return drizzlePg(client, { schema: schemaWithRelations });
}

export function createTestPool() {
  return new PgPool({ connectionString });
}

// HELPER FUNCTIONS (used by test setup)
export function setTestDb(testDb: Db | null) {
  _testDb = testDb;
}

export async function withTransaction<T>(callback: (tx: Transaction) => Promise<T>): Promise<T> {
  // In a test, the test's own transaction: this one is a savepoint in it, which a failure rolls back as in production.
  const result = await (globalThis.__getTestDb?.() ?? _db).transaction(callback);
  clearRequestCache();
  return result;
}

instrumentQueries();

// Register getter on global for index.ts to use
globalThis.__getTestDb = () => _testDb;
