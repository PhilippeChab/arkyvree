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

/**
 * Runs `write`, answering a unique index's refusal with the error `refusalOf` gives for that index (a 409 saying what's
 * taken), or with the database's own when it gives none. A check that reads a value as free doesn't hold it: two
 * requests that claim one value at once both pass it, and the second one's write meets the index.
 */
export async function withUniqueRefusal<T>(write: () => Promise<T>, refusalOf: (index: string) => Error | undefined) {
  try {
    return await write();
  } catch (error) {
    const index = readUniqueViolation(error);
    throw (index === undefined ? undefined : refusalOf(index)) ?? error;
  }
}
