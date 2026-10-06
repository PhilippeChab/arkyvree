/**
 * Copies the seeded test database into one per `bun test --parallel` worker: <its name>_w1 … _wN, the one
 * `server/database/test.ts` picks from BUN_TEST_WORKER_ID, so workers never share a session.
 *
 * Usage: bun --env-file=.env.test scripts/db/provision-test-dbs.ts [--workers N] (N: the CPU count by default)
 */
import os from "node:os";

import { cloneDatabase, databaseOf } from "@/scripts/db/databases.ts";

/** The `--workers` count, else one per CPU. */
function workers(): number {
  const index = process.argv.indexOf("--workers");
  const count = index === -1 ? Number.NaN : Number.parseInt(process.argv[index + 1], 10);
  return Number.isInteger(count) && count > 0 ? count : os.cpus().length;
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set: run with --env-file=.env.test");
  const count = workers();
  const workerDbs = Array.from({ length: count }, (_, i) => `${databaseOf(url).name}_w${i + 1}`);
  await cloneDatabase(url, workerDbs);
  console.log(`Provisioned ${count} worker DB${count === 1 ? "" : "s"} (${workerDbs[0]}..${workerDbs.at(-1)})`);
}

await main();
