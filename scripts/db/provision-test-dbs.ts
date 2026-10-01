/**
 * Provisions per-worker test databases by cloning the template DB.
 *
 * Usage: bun scripts/db/provision-test-dbs.ts [--workers N]
 *
 * Produces: arkyvree_test_w1 ... arkyvree_test_wN (clones of arkyvree_test).
 * `server/database/test.ts` picks the worker-specific DB from BUN_TEST_WORKER_ID.
 *
 * Run before `bun test --parallel`. The old custom worker pool lived in
 * tests/test-parallel.ts; Bun 1.3.13's --parallel replaces that, but we still
 * need one DB per worker to avoid session-level collisions.
 */
import os from "node:os";

import { cloneDatabase, databaseOf } from "@/scripts/db/clone-database.ts";

const DATABASE_URL = process.env.DATABASE_URL ?? "postgresql://devuser:devpass@localhost:5433/arkyvree_test";

function parseWorkers(): number {
  const idx = process.argv.indexOf("--workers");
  if (idx !== -1) {
    const n = parseInt(process.argv[idx + 1], 10);
    if (!isNaN(n) && n > 0) return n;
  }
  return os.cpus().length;
}

const workerCount = parseWorkers();
const workerDbs = Array.from({ length: workerCount }, (_, i) => `${databaseOf(DATABASE_URL).name}_w${i + 1}`);
await cloneDatabase(DATABASE_URL, workerDbs);
console.log(
  `Provisioned ${workerCount} worker DB${workerCount === 1 ? "" : "s"} (${workerDbs[0]}..${workerDbs.at(-1)})`,
);
