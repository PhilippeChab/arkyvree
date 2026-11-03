/** How long an export is kept: pending while its job waits, then its file for the hour after it's made. */

/** A pending export's: a day, past which the daily cleanup deletes it, its job long lost. */
export const PENDING_EXPORT_TTL_MS = 24 * 60 * 60 * 1000;

/** A ready export's: an hour from when its file is stored. */
export const READY_EXPORT_TTL_MS = 60 * 60 * 1000;
