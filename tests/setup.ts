/**
 * Global test setup - runs before all tests
 * Automatically wraps every test in a transaction that gets rolled back
 */
import {
  createTestDbFromClient,
  createTestPool,
  setTestDb,
} from "@/server/database/test.ts";
import { setStorageForTest, type StorageBackend } from "@/server/storage/s3.ts";
import { afterEach, beforeEach } from "bun:test";
import type { NodePgClient } from "drizzle-orm/node-postgres";
import type { PoolClient } from "pg";

// Default storage backend for tests so a forgotten setStorageForTest doesn't
// silently call Bun.s3.presign against the CI fake endpoint. Per-test setups
// can still override via setStorageForTest().
const inMemoryStorage: StorageBackend = {
  presignPut: () => "https://fake.example.com/key?sig=fake",
  publicUrl: (k) => `https://fake.example.com/${k}`,
  async deleteObject() {},
  async objectExists() {
    return true;
  },
  async objectStats() {
    return { size: 1024, etag: "fake" };
  },
};
setStorageForTest(inMemoryStorage);

// Import test module to register the global test database getter
// This happens automatically via the TEST_DB_SYMBOL in test.ts

// Create a shared test pool
const testPool = createTestPool();

let testClient: PoolClient | null = null;

// Global setup: wrap every test in a transaction
beforeEach(async () => {
  testClient = await testPool.connect();
  await testClient.query("BEGIN");

  const testDb = createTestDbFromClient(testClient as unknown as NodePgClient);
  setTestDb(testDb);
});

// Global teardown: rollback every test
afterEach(async () => {
  setTestDb(null);

  if (testClient) {
    await testClient.query("ROLLBACK");
    testClient.release();
    testClient = null;
  }
});

console.log("Global transactional test setup loaded");
