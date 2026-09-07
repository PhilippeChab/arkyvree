/**
 * PRODUCTION DATABASE IMPLEMENTATION
 */
import * as relations from "@/drizzle/relations.ts";
import * as schema from "@/drizzle/schema.ts";
import type { ExtractTablesWithRelations } from "drizzle-orm";
import type { NodePgClient } from "drizzle-orm/node-postgres";
import { drizzle } from "drizzle-orm/node-postgres";
import { type PgQueryResultHKT, type PgTransaction } from "drizzle-orm/pg-core";
import { Pool } from "pg";

import { clearRequestCache } from "@/server/database/requestCache.ts";
import { instrumentQueries } from "@/server/timing.ts";

instrumentQueries();

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is not set");
}

const schemaWithRelations = { ...schema, ...relations };
const pool = new Pool({
  connectionString,
  max: parseInt(process.env.DB_POOL_MAX || "20", 10),
  // Set DB_POOL_MIN to keep a floor of connections warm (character reads
  // dispatch 4+ parallel queries; a warm pool avoids paying ~200-300ms per
  // new TLS handshake to Neon's pooler). Default is 0 so the app can still
  // scale-to-zero — open connections keep Neon's compute from auto-suspending.
  min: parseInt(process.env.DB_POOL_MIN || "0", 10),
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
  // TCP-level keepalive so intermediate load balancers / Neon's pooler don't
  // silently drop long-idle sockets before idleTimeoutMillis fires.
  keepAlive: true,
  keepAliveInitialDelayMillis: 10_000,
  statement_timeout: 10000,
  query_timeout: 10000,
});

pool.on("error", (err) => {
  console.error("[db] Unexpected pool client error:", err.message);
});

export { pool };
export const db = drizzle(pool as NodePgClient, { schema: schemaWithRelations });

export async function withTransaction<T>(
  callback: (tx: Transaction) => Promise<T>,
): Promise<T> {
  const result = await db.transaction(callback);
  // Invalidate the request-scoped dedup cache: reads that happened before the
  // mutation may now be stale, so the next `find*` must go back to the DB.
  clearRequestCache();
  return result;
}

export type Db = typeof db | Transaction;
export type Transaction = PgTransaction<
  PgQueryResultHKT,
  typeof schemaWithRelations,
  ExtractTablesWithRelations<typeof schemaWithRelations>
>;
