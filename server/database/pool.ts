import { Pool, type PoolConfig } from "pg";

import QueryInstrumentation from "@/server/QueryInstrumentation.ts";

/**
 * A connection pool whose queries are timed (`QueryInstrumentation.instrument` patches pg's pool and client, once)
 * and whose idle clients' errors are logged instead of crashing the process.
 */
export function createPool(config: PoolConfig) {
  QueryInstrumentation.instrument();
  const pool = new Pool(config);
  pool.on("error", (err) => {
    console.error("[db] Unexpected pool client error:", err.message);
  });
  return pool;
}
