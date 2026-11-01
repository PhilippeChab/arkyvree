import { sql } from "drizzle-orm";

import type { Db } from "@/drizzle/database.ts";
import { isRecord } from "@/shared/isRecord.ts";

/** Postgres's codes for a lock a statement gave up on: its wait past `lock_timeout`, or a deadlock it was chosen in. */
const LOCK_FAILURES = new Set(["55P03", "40P01"]);

/**
 * Whether an error is Postgres giving up on a lock (`LOCK_FAILURES`): another write held it past the wait a write
 * allows (`setLockTimeout`), or the two waited on each other. The write can be sent again.
 */
export function isLockFailure(error: unknown): boolean {
  const cause = isRecord(error) ? (error.cause ?? error) : error;
  return isRecord(cause) && typeof cause.code === "string" && LOCK_FAILURES.has(cause.code);
}

/**
 * Bounds how long a transaction's statements wait on a lock (`milliseconds`), until it ends: a write waiting on
 * another's longer than that gives up (`isLockFailure`) instead of reaching the statement timeout.
 */
export async function setLockTimeout(tx: Db, milliseconds: number) {
  await tx.execute(sql.raw(`SET LOCAL lock_timeout = ${Math.trunc(milliseconds)}`));
}
