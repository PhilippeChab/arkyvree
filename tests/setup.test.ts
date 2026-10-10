/** The setup's end of a test: nothing a test does past its end (its timeout) is committed. */

import { expect, test } from "bun:test";
import path from "node:path";

import { createTestPool } from "@/server/database/test.ts";
import { readTestDatabaseUrl } from "@/server/database/testDatabaseUrl.ts";

import { uniqueId } from "./support/seed.ts";

/** The tests that outlive their timeout, run in a `bun test` of their own. */
const OUTLIVING_TESTS = "./tests/fixtures/outlivingTests.ts";

/**
 * The users the outliving tests committed (their emails start with `marker`), removed on a connection of their own:
 * a write that escaped its test's rollback would otherwise stay in the test database for every later run.
 */
async function removeCommitted(marker: string) {
  const pool = createTestPool();
  try {
    const { rows } = await pool.query<{ email_address: string }>(
      "DELETE FROM account.users WHERE email_address LIKE $1 RETURNING email_address",
      [`${marker}-%`],
    );
    return rows.map((row) => row.email_address);
  } finally {
    await pool.end();
  }
}

/**
 * Runs the outliving tests on this run's test database, which they write `marker`'s users to past their end: their
 * output, once they ran. A worker's id would name another database: the run's is given whole.
 */
async function runOutlivingTests(marker: string) {
  const { BUN_TEST_WORKER_ID: _worker, JEST_WORKER_ID: _jestWorker, ...env } = process.env;
  const run = Bun.spawn([process.execPath, "test", OUTLIVING_TESTS], {
    cwd: path.resolve(import.meta.dir, ".."),
    env: { ...env, DATABASE_URL: readTestDatabaseUrl(), OUTLIVED_MARKER: marker },
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr] = await Promise.all([new Response(run.stdout).text(), new Response(run.stderr).text()]);
  await run.exited;
  return `${stdout}${stderr}`;
}

test("a test that outlives its timeout commits nothing it writes past it", async () => {
  const marker = `outlived-${uniqueId()}`;
  const output = await runOutlivingTests(marker);

  expect(await removeCommitted(marker)).toEqual([]);
  // Two timed out, and the last found the writes they made past their end refused
  expect(output.match(/this test timed out after/g)).toHaveLength(2);
  expect(output).toMatch(/^\s*1 pass$/m);
}, 30_000);
