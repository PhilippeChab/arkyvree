/**
 * Database connection - conditionally loads test or production implementation
 */
import { isTest, readEnv } from "@/server/environment.ts";

if (!readEnv("DATABASE_URL")) {
  throw new Error("DATABASE_URL is not set");
}

// Use dynamic imports to avoid loading test module in production. The test module refuses a database not named a test one.
const dbModule = isTest() ? await import("./test.ts") : await import("./production.ts");

export const db = dbModule.db;
export const withTransaction = dbModule.withTransaction;
export type { Db } from "./production.ts";

export { getCowContext, withCowContext } from "./cowContext.ts";
export type { CowData, IdResolveMap, OverrideMap } from "./cowContext.ts";
export { clearRequestCache, memoizeRequest, runWithRequestCache } from "./requestCache.ts";
export { waitForDatabase } from "./waitForDatabase.ts";
