import { Pool, type PoolConfig } from "pg";

import { instrumentQueries } from "@/server/timing.ts";

/**
 * A connection pool whose queries are timed (`instrumentQueries` patches pg's pool and client, once) and whose idle
 * clients' errors are logged instead of crashing the process.
 */
export function createPool(config: PoolConfig) {
  instrumentQueries();
  const pool = new Pool(config);
  pool.on("error", (err) => {
    console.error("[db] Unexpected pool client error:", err.message);
  });
  return pool;
}
