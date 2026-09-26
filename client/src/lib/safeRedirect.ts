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
