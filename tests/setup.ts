/**
 * Preloaded before every backend test file (bunfig.toml). Each test runs in
 * its own transaction, rolled back afterwards, against a fake storage backend.
 */
import { afterEach, beforeEach } from "bun:test";
import type { NodePgClient } from "drizzle-orm/node-postgres";
import type { PoolClient } from "pg";
import { createTestDbFromClient, createTestPool, setTestDb } from "@/server/database/test.ts";
import { setStorageForTest } from "@/server/storage/s3.ts";
import { forgetSeededRulesetWrites } from "@/tests/helpers.ts";
import { fakeStorage } from "@/tests/storage.ts";

const testPool = createTestPool();
let testClient: PoolClient | null = null;

beforeEach(async () => {
  // Never reach real storage. A test can swap in its own fake for itself.
  setStorageForTest(fakeStorage());

  testClient = await testPool.connect();
  await testClient.query("BEGIN");
  setTestDb(createTestDbFromClient(testClient as unknown as NodePgClient));
});

afterEach(async () => {
  setTestDb(null);

  if (testClient) {
    await testClient.query("ROLLBACK");
    testClient.release();
    testClient = null;
  }
  forgetSeededRulesetWrites();
});
