/**
 * Preloaded before every backend test file (bunfig.toml). Each test runs in its own transaction, rolled back
 * afterwards, against a fake storage backend. Nothing a test does is committed, even past its end (its timeout, or work
 * it never awaited): its connection runs nothing it hands in after its rollback, and outside a test the code reads the
 * run's pool read-only.
 */

import { afterEach, beforeEach } from "bun:test";

import type { PoolClient } from "pg";

import { createTestPool, setTestDb, startTestTransaction } from "@/server/database/test.ts";
import ObjectStorage from "@/server/storage/ObjectStorage.ts";

import { forgetSeededRulesetWrites } from "./support/rulesets.ts";
import { fakeStorage } from "./support/storage.ts";

/** The running test's connection, and what ends its transaction. */
let running: { client: PoolClient; end: () => Promise<void> } | null = null;
const testPool = createTestPool();

beforeEach(async () => {
  // Never reach real storage. A test can swap in its own fake for itself.
  ObjectStorage.setForTest(fakeStorage());

  // The test's database is a transaction held open until it ends, then rolled back: a transaction the code under
  // test opens in it is a savepoint, which never commits the test's rows.
  const client = await testPool.connect();
  try {
    const { end, tx } = await startTestTransaction(client);
    running = { client, end };
    setTestDb(tx);
  } catch (error) {
    // A client whose transaction failed is in an unknown state: the pool drops it instead of reusing it.
    client.release(true);
    throw error;
  }
});

afterEach(async () => {
  setTestDb(null);
  const ended = running;
  running = null;
  try {
    await ended?.end();
    ended?.client.release();
  } catch (error) {
    // A client whose rollback failed is in an unknown state: the pool drops it instead of reusing it.
    ended?.client.release(true);
    throw error;
  } finally {
    forgetSeededRulesetWrites();
  }
});

// Before the first test, as between tests, the code reads the run's pool read-only.
setTestDb(null);
