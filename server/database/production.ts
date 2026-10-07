/** The database outside the tests (index.ts picks it): a pool on DATABASE_URL, and the Db and transactions on it. */

import type { ExtractTablesWithRelations } from "drizzle-orm";
import { drizzle, type NodePgClient } from "drizzle-orm/node-postgres";
import { type PgQueryResultHKT, type PgTransaction } from "drizzle-orm/pg-core";

import * as relations from "@/drizzle/relations.ts";
import * as schema from "@/drizzle/schema.ts";
import { readEnv, readRequiredEnv } from "@/server/environment.ts";

import { createPool } from "./pool.ts";
import { clearRequestCache } from "./requestCache.ts";

export type Db = typeof db | Transaction;

export type Transaction = PgTransaction<
  PgQueryResultHKT,
  typeof schemaWithRelations,
  ExtractTablesWithRelations<typeof schemaWithRelations>
>;

const pool = createPool({
  connectionString: readRequiredEnv("DATABASE_URL"),
  max: parseInt(readEnv("DB_POOL_MAX") || "20", 10),
  // Set DB_POOL_MIN to keep a floor of connections warm (character reads
  // dispatch 4+ parallel queries; a warm pool avoids paying ~200-300ms per
  // new TLS handshake to Neon's pooler). Default is 0 so the app can still
  // scale-to-zero — open connections keep Neon's compute from auto-suspending.
  min: parseInt(readEnv("DB_POOL_MIN") || "0", 10),
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
  // TCP-level keepalive so intermediate load balancers / Neon's pooler don't
  // silently drop long-idle sockets before idleTimeoutMillis fires.
  keepAlive: true,
  keepAliveInitialDelayMillis: 10_000,
  statement_timeout: 10000,
  query_timeout: 10000,
});
const schemaWithRelations = { ...schema, ...relations };

export const db = drizzle(pool as NodePgClient, { schema: schemaWithRelations });

export async function withTransaction<T>(callback: (tx: Transaction) => Promise<T>): Promise<T> {
  const result = await db.transaction(callback);
  // Invalidate the request-scoped dedup cache: reads that happened before the
  // mutation may now be stale, so the next `find*` must go back to the DB.
  clearRequestCache();
  return result;
}
