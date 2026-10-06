import { readEnv, readRequiredEnv } from "@/server/environment.ts";

/**
 * The test database's URL, which must name a test database: anything else stops the run before it connects. Under
 * `bun test --parallel`, each worker (`BUN_TEST_WORKER_ID`, from 1) has its own copy; a single file's run uses the base
 * one.
 */
export function readTestDatabaseUrl() {
  const baseUrl = readRequiredEnv("DATABASE_URL");
  if (!baseUrl.includes("test")) {
    throw new Error(
      "FATAL: Test database module loaded with non-test DATABASE_URL. " +
        "This is a safety violation. Ensure DATABASE_URL contains 'test'.",
    );
  }
  const workerId = readEnv("BUN_TEST_WORKER_ID");
  return workerId ? baseUrl.replace(/\/([^/?]+)(\?|$)/, `/$1_w${workerId}$2`) : baseUrl;
}
