import { ApiError } from "@/client/src/services/apiError.ts";

/** A caught error's message for the user, or the fallback when it carries none. */
export function errorMessage(error: unknown, fallback: string): string {
  if (typeof error === "string") return error || fallback;
  return error instanceof Error && error.message ? error.message : fallback;
}

/** The record is gone or no longer visible to this viewer (404 / 403), not a passing failure. */
export function accessLost(error: unknown): boolean {
  return error instanceof ApiError && (error.status === 404 || error.status === 403);
}

/** Why a page's record didn't load: "Class not found" on a 404, no access on a 403, "Failed to load class" otherwise. */
export function loadFailureMessage(what: string, error: unknown): string {
  if (error instanceof ApiError && error.status === 404) return `${what} not found`;
  if (error instanceof ApiError && error.status === 403) return `You don't have access to this ${what.toLowerCase()}`;
  return `Failed to load ${what.toLowerCase()}`;
}
