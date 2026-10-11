/**
 * Tests that outlive their timeout on purpose, which `tests/setup.test.ts` runs in a `bun test` of their own: past its
 * end, each writes a user (its email `OUTLIVED_MARKER` and its way), through the shared `db` or through the transaction
 * it opened. The last waits for them, and checks that their writes were refused.
 */

import { expect, test } from "bun:test";

import { sql } from "drizzle-orm";

import { usersInAccount } from "@/drizzle/schema.ts";
import { db, withTransaction } from "@/server/database/index.ts";

/** How each test's writes past its end ended: the error they were refused with, or "written". */
const outliving: Promise<string>[] = [];

/** How long a test sleeps on its connection: well past its timeout. */
const SLEEP_SECONDS = 1;

/** What ends a test that outlives its timeout. */
const TIMEOUT_MS = 100;

/** The email of the user a test writes past its end: the parent test's marker and `way`. */
function emailOf(way: string) {
  return `${process.env.OUTLIVED_MARKER}-${way}@example.com`;
}

/** A test's body, `work`, kept running past the test's end, which the last test waits for. */
function outlive(work: () => Promise<unknown>) {
  const running = work();
  outliving.push(running.then(() => "written", refusalOf));
  return running;
}

/** The message of the error a write was refused with: the database's, under drizzle's. */
function refusalOf(error: unknown) {
  if (!(error instanceof Error)) return String(error);
  return error.cause instanceof Error ? error.cause.message : error.message;
}

test(
  "writes through db past its timeout",
  () =>
    outlive(async () => {
      await db.execute(sql`select pg_sleep(${SLEEP_SECONDS})`);
      await db.insert(usersInAccount).values({ emailAddress: emailOf("db") });
    }),
  TIMEOUT_MS,
);

test(
  "writes through its transaction past its timeout",
  () =>
    outlive(() =>
      withTransaction(async (tx) => {
        await tx.execute(sql`select pg_sleep(${SLEEP_SECONDS})`);
        await tx.insert(usersInAccount).values({ emailAddress: emailOf("transaction") });
      }),
    ),
  TIMEOUT_MS,
);

test("their writes past their end were refused", async () => {
  const [throughDb, throughTransaction] = await Promise.all(outliving);
  expect(throughDb).toBe("cannot execute INSERT in a read-only transaction");
  expect(throughTransaction).toStartWith("The test ended");
});
