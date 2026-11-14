import { ApiError } from "@/client/src/services/ApiError.ts";

/** The record is gone or no longer visible to this viewer (404 / 403), not a passing failure. */
export function accessLost(error: unknown): boolean {
  return error instanceof ApiError && (error.status === 404 || error.status === 403);
}

/**
 * A save refused for the record's state as the page read it (a 409 that stands, not a lock's give-up: "modified by
 * someone else"): the page's copy is stale, and refetching it lets the next attempt start from what's there now.
 */
export function editConflict(error: unknown): boolean {
  return error instanceof ApiError && error.status === 409 && !saveBusy(error);
}

/** A sign-in refused until its email is verified (`EmailNotVerifiedError`): the email waits for its code. */
export function emailNotVerified(error: unknown): boolean {
  return error instanceof ApiError && error.errorName === "EmailNotVerifiedError";
}

/** What a picker's list says when it shows no option: why its options didn't load, else `otherwise` (MUI's default). */
export function emptyOptionsText(what: string, error: unknown, otherwise?: string) {
  return error ? loadFailureMessage(what, error) : otherwise;
}

/** A caught error's message for the user, or the fallback when it carries none. */
export function errorMessage(error: unknown, fallback: string): string {
  if (typeof error === "string") return error || fallback;
  return error instanceof Error && error.message ? error.message : fallback;
}

/** Why a page's record didn't load: "Class not found" on a 404, no access on a 403, "Failed to load class" otherwise. */
export function loadFailureMessage(what: string, error: unknown): string {
  if (error instanceof ApiError && error.status === 404) return `${what} not found`;
  if (error instanceof ApiError && error.status === 403) return `You don't have access to this ${what.toLowerCase()}`;
  return `Failed to load ${what.toLowerCase()}`;
}

/** A request refused for coming too often (a 429, the server's rate limits): the user waits a moment, then retries. */
export function rateLimited(error: unknown): boolean {
  return error instanceof ApiError && error.status === 429;
}

/** A save that gave up on another's lock (`BusyError`), a 409 that changed nothing: it can be sent again. */
export function saveBusy(error: unknown): boolean {
  return error instanceof ApiError && error.errorName === "BusyError";
}
