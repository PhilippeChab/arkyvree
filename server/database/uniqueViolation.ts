import { isRecord } from "@/shared/isRecord.ts";

/**
 * The unique index or constraint Postgres refused a write for (`23505`), read from its error or the one drizzle wraps
 * it in (`DrizzleQueryError`'s `cause`); undefined for any other error.
 */
export function readUniqueViolation(error: unknown) {
  const cause = isRecord(error) ? (error.cause ?? error) : error;
  if (!isRecord(cause) || cause.code !== "23505") return undefined;
  return typeof cause.constraint === "string" ? cause.constraint : "";
}
