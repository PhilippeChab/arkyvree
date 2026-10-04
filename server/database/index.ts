/**
 * Database connection - conditionally loads test or production implementation
 */
import { sql } from "drizzle-orm";

import { isTest, readEnv } from "@/server/environment.ts";

if (!readEnv("DATABASE_URL")) {
  throw new Error("DATABASE_URL is not set");
}

// Use dynamic imports to avoid loading test module in production. The test module refuses a database not named a test one.
const dbModule = isTest() ? await import("./test.ts") : await import("./production.ts");

export const db = dbModule.db;
export const withTransaction = dbModule.withTransaction;
export type { Db } from "./production.ts";

/**
 * Waits for the database to answer before a process starts serving: a few tries, each waiting longer, then the
 * process exits (a fresh deploy can come up before the database accepts connections).
 */
export async function waitForDatabase(attempts = 4, delayMs = 500) {
  for (let i = 1; i <= attempts; i++) {
    try {
      await db.execute(sql`SELECT 1`);
      console.log("[db] Connection pool warmed up");
      return;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[db] Warm-up attempt ${i}/${attempts} failed: ${msg}`);
      if (i < attempts) await new Promise((r) => setTimeout(r, delayMs * i));
    }
  }
  console.error("[db] Unreachable after all retries — exiting");
  process.exit(1);
}

export { getCowContext, withCowContext } from "./cowContext.ts";
export type { CowData, IdResolveMap, OverrideMap } from "./cowContext.ts";
export { clearRequestCache, memoizeRequest, runWithRequestCache } from "./requestCache.ts";
