/**
 * Database connection - conditionally loads test or production implementation
 */

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is not set");
}

// Use dynamic imports to avoid loading test module in production
const isTestMode = connectionString.includes("test");

let dbModule;
if (isTestMode) {
  dbModule = await import("./test.ts");
} else {
  dbModule = await import("./production.ts");
}

export const db = dbModule.db;
export const withTransaction = dbModule.withTransaction;
export const pool = dbModule.pool;
export type { Db, Transaction } from "./production.ts";
