/**
 * Database connection - conditionally loads test or production implementation
 */
import { isTest } from "@/server/environment.ts";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not set");
}

// Use dynamic imports to avoid loading test module in production. The test module refuses a database not named a test one.
const dbModule = isTest() ? await import("./test.ts") : await import("./production.ts");

export const db = dbModule.db;
export const withTransaction = dbModule.withTransaction;
export type { Db } from "./production.ts";
