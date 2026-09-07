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
import pg from "pg";
import os from "node:os";

const DATABASE_URL = process.env.DATABASE_URL ?? "postgresql://devuser:devpass@localhost:5433/arkyvree_test";
const dbUrl = new URL(DATABASE_URL);
const TEMPLATE_DB = dbUrl.pathname.slice(1);
const DB_BASE = `${TEMPLATE_DB}_w`;
const DB_URL_BASE = `${dbUrl.protocol}//${dbUrl.username}:${dbUrl.password}@${dbUrl.host}`;

function parseWorkers(): number {
  const idx = process.argv.indexOf("--workers");
  if (idx !== -1) {
    const n = parseInt(process.argv[idx + 1], 10);
    if (!isNaN(n) && n > 0) return n;
  }
  return os.cpus().length;
}

const workerCount = parseWorkers();

const client = new pg.Client({ connectionString: `${DB_URL_BASE}/postgres` });
await client.connect();

try {
  // Drop old worker DBs
  for (let i = 1; i <= workerCount; i++) {
    const dbName = `${DB_BASE}${i}`;
    await client.query(
      `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()`,
      [dbName],
    );
    await client.query(`DROP DATABASE IF EXISTS "${dbName}"`);
  }

  // CREATE DATABASE ... TEMPLATE requires no active connections to the template.
  await client.query(`ALTER DATABASE "${TEMPLATE_DB}" WITH allow_connections = false`);

  for (let attempt = 0; attempt < 10; attempt++) {
    const active = await client.query<{ count: string }>(
      `SELECT count(*) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()`,
      [TEMPLATE_DB],
    );
    if (parseInt(active.rows[0].count) === 0) break;
    if (attempt === 9) {
      await client.query(
        `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()`,
        [TEMPLATE_DB],
      );
    }
    await new Promise((r) => setTimeout(r, 500));
  }

  for (let i = 1; i <= workerCount; i++) {
    await client.query(`CREATE DATABASE "${DB_BASE}${i}" TEMPLATE "${TEMPLATE_DB}"`);
  }

  await client.query(`ALTER DATABASE "${TEMPLATE_DB}" WITH allow_connections = true`);

  console.log(`Provisioned ${workerCount} worker DB${workerCount === 1 ? "" : "s"} (${DB_BASE}1..${DB_BASE}${workerCount})`);
} finally {
  await client.end();
}
