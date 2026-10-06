/**
 * Preloaded before every backend test file (bunfig.toml). Each test runs in its own transaction, rolled back
 * afterwards, against a fake storage backend.
 */

import { afterEach, beforeEach } from "bun:test";

import { TransactionRollbackError } from "drizzle-orm/errors";
import type { NodePgClient } from "drizzle-orm/node-postgres";
import type { PoolClient } from "pg";

import { createTestDbFromClient, createTestPool, setTestDb } from "@/server/database/test.ts";
import { setStorageForTest } from "@/server/storage/s3.ts";
import { forgetSeededRulesetWrites } from "@/tests/support/rulesets.ts";
import { fakeStorage } from "@/tests/support/storage.ts";

const testPool = createTestPool();
let testClient: PoolClient | null = null;
let endTest: (() => void) | null = null;
let testTransaction: Promise<void> | null = null;
let transactionFailure: Error | undefined;
let testStarted = false;

beforeEach(async () => {
  // Never reach real storage. A test can swap in its own fake for itself.
  setStorageForTest(fakeStorage());

  // The test's database is a transaction held open until it ends, then rolled back: a transaction the code under
  // test opens in it is a savepoint, which never commits the test's rows.
  testClient = await testPool.connect();
  const clientDb = createTestDbFromClient(testClient as unknown as NodePgClient);
  await new Promise<void>((started, failed) => {
    testTransaction = clientDb
      .transaction(async (tx) => {
        setTestDb(tx);
        testStarted = true;
        started();
        await new Promise<void>((resolve) => {
          endTest = resolve;
        });
        tx.rollback();
      })
      .catch((error: unknown) => {
        if (error instanceof TransactionRollbackError) return;
        transactionFailure = error instanceof Error ? error : new Error(String(error));
        failed(transactionFailure); // before it started, the test can't run; after, afterEach reports it
      });
  });
});

afterEach(async () => {
  setTestDb(null);
  endTest?.();
  await testTransaction;
  // A transaction that failed before the test started already failed beforeEach.
  const failure = transactionFailure;
  const reported = !testStarted;
  // A client whose transaction failed is in an unknown state: the pool drops it instead of reusing it.
  testClient?.release(failure);
  testClient = null;
  endTest = null;
  testTransaction = null;
  transactionFailure = undefined;
  testStarted = false;
  forgetSeededRulesetWrites();
  if (failure && !reported) throw failure;
});
