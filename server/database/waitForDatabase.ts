import { sql } from "drizzle-orm";

import { db } from "./index.ts";

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
