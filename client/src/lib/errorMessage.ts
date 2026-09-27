import { ApiError } from "@/client/src/services/rpc.ts";

/** A caught error's message for the user, or the fallback when it carries none. */
export function errorMessage(error: unknown, fallback: string): string {
  if (typeof error === "string") return error || fallback;
  return error instanceof Error && error.message ? error.message : fallback;
}

/** Why a page's record didn't load: "Class not found" on a 404, "Failed to load class" otherwise. */
export function loadFailureMessage(what: string, error: unknown): string {
  return error instanceof ApiError && error.status === 404 ? `${what} not found` : `Failed to load ${what.toLowerCase()}`;
}
