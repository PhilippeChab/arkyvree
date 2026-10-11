/**
 * Where an auth page sends its user once signed in: the page that sent them to sign in, carried along in a link's
 * `?redirect=` (`authPagePath`) or an auth page's router state (`authPageState`), and read back by `useAuthRedirect`.
 */

import { isRecord } from "@/shared/isRecord.ts";

/** The router state an auth page is opened with. */
export interface AuthPageState {
  /** The auth page that sent the user here: verifying an email after a sign-in goes back to sign in. */
  from?: "sign-in";
  /** Where the user was going, which verifying an email carries along (null: the dashboard). */
  redirect?: string | null;
}

/** An auth page's path, carrying along the page its user goes to once signed in (none: the dashboard). */
export function authPagePath(path: string, redirect: string | null) {
  return redirect ? `${path}?redirect=${encodeURIComponent(redirect)}` : path;
}

/** Reads an auth page's router state; anything else in it is ignored. */
export function authPageState(state: unknown): AuthPageState {
  if (!isRecord(state)) return {};
  return {
    ...(state.from === "sign-in" && { from: "sign-in" }),
    ...(typeof state.redirect === "string" && { redirect: state.redirect }),
  };
}

/**
 * Return `raw` only when it is a path on this origin, else null. Resolving it
 * with the URL parser catches `//host`, `/\host` and tab/newline tricks that a
 * prefix check misses; the router would hand such a cross-origin URL to
 * `location.assign`.
 */
export function safeRedirectPath(raw: unknown): string | null {
  if (typeof raw !== "string" || !raw.startsWith("/")) return null;
  try {
    const url = new URL(raw, window.location.origin);
    if (url.origin !== window.location.origin) return null;
    return url.pathname + url.search + url.hash;
  } catch {
    return null;
  }
}
