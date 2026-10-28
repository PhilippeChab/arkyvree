import { describe, expect, test } from "bun:test";

import { sql } from "drizzle-orm";

import type { Transaction } from "@/drizzle/database.ts";
import { readUniqueViolation, withTransaction } from "@/server/database/index.ts";
import { Users } from "@/server/repositories/index.ts";
import { uniqueId } from "@/tests/support/seed.ts";

/** The error `write` fails with, in a savepoint of its own so the test's transaction carries on. */
async function failureOf(write: (tx: Transaction) => Promise<unknown>) {
  return await withTransaction(write).then(
    () => undefined,
    (error: unknown) => error,
  );
}

describe("readUniqueViolation", () => {
  test("names the unique index a write broke, under drizzle's error or bare", async () => {
    const emailAddress = `unique-${uniqueId()}@example.com`;
    const username = `unique-${uniqueId()}`;
    const [holder] = await withTransaction((tx) => Users.create(tx, { emailAddress }));
    await withTransaction((tx) => Users.update(tx, { username }, { id: holder.id }));
    const [other] = await withTransaction((tx) => Users.create(tx, { emailAddress: `other-${emailAddress}` }));

    const error = await failureOf((tx) => Users.create(tx, { emailAddress }));
    expect(readUniqueViolation(error)).toBe("users_email");
    expect(readUniqueViolation((error as Error).cause)).toBe("users_email");
    expect(readUniqueViolation(await failureOf((tx) => Users.update(tx, { username }, { id: other.id })))).toBe(
      "users_username",
    );
  });

  test("reads nothing in any other error", async () => {
    expect(readUniqueViolation(await failureOf((tx) => tx.execute(sql`select 1 / 0`)))).toBeUndefined();
    expect(readUniqueViolation(new Error("not the database's"))).toBeUndefined();
    expect(readUniqueViolation("23505")).toBeUndefined();
  });
});
