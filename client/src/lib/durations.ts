/** The durations the client waits or keeps data for, in milliseconds: a query's `staleTime`, `gcTime` or interval. */

export const ONE_MINUTE = 60_000;
export const FIVE_MINUTES = 5 * ONE_MINUTE;
export const FIVE_SECONDS = 5_000;
/** Data that never goes stale on its own: a static file, a preview kept per plan. */
export const FOREVER = Infinity;
export const NO_TIME = 0;
