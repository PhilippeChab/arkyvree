/** The database connection: the test or the production one, and whether it answers. */

import { sql } from "drizzle-orm";

import { isTest } from "@/server/environment.ts";

/**
 * Use dynamic imports to avoid loading test module in production. The test module refuses a database not named a test
 * one.
 */
const dbModule = isTest() ? await import("./test.ts") : await import("./production.ts");

export const db = dbModule.db;
export const withTransaction = dbModule.withTransaction;

/** Whether the database answers: throws when it doesn't. */
export async function pingDatabase() {
  await db.execute(sql`SELECT 1`);
}

/**
 * Waits for the database to answer before a process starts serving: a few tries, each waiting longer, then the
 * process exits (a fresh deploy can come up before the database accepts connections).
 */
export async function waitForDatabase(attempts = 4, delayMs = 500) {
  for (let i = 1; i <= attempts; i++) {
    try {
      await pingDatabase();
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
