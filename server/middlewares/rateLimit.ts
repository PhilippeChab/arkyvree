import { limitRate } from "./limitRate.ts";

const MINUTE = 60 * 1000;

/**
 * The public API's requests from each IP, counted before their key is looked up: a request with a wrong key or none
 * costs a lookup too. Above a key's own limit, so one client's keys still run together.
 */
export const apiClientRateLimit = limitRate({ windowMs: MINUTE, limit: 600 });

/** The public API's requests, counted per key: an agent's run reads a character and its choices a few times a level. */
export const apiKeyRateLimit = limitRate({ windowMs: MINUTE, limit: 120, per: "key" });

/**
 * Each direct-upload commits a blob row + S3 object that the sweep won't reclaim until UNATTACHED_BLOB_TTL_MS
 * (server/jobs/sweepPendingBlobs.ts) after creation. Cap per-IP creation rate so a single scripted client can't bloat storage at
 * will.
 */
export const attachmentUploadRateLimit = limitRate({ windowMs: MINUTE, limit: 20 });

export const authEmailRateLimit = limitRate({ windowMs: 15 * MINUTE, limit: 10, per: "email" });

export const authRateLimit = limitRate({ windowMs: 15 * MINUTE, limit: 15 });

export const authSessionRateLimit = limitRate({ windowMs: 15 * MINUTE, limit: 60 });

export const exportRateLimit = limitRate({ windowMs: MINUTE, limit: 5 });

/** An import reads a whole character file and builds the character level by level: a few a minute is plenty. */
export const importRateLimit = limitRate({ windowMs: MINUTE, limit: 10 });

/** What a picked character file is: asked once a file is picked, its header's tags read, nothing built. */
export const importSourceRateLimit = limitRate({ windowMs: MINUTE, limit: 30 });

/**
 * A character's choices at its next level, counted per key apart from its other requests: one builds the character a
 * time for each step and each pool it reads.
 */
export const levelChoicesRateLimit = limitRate({ windowMs: MINUTE, limit: 20, per: "key" });

export const publicApiRateLimit = limitRate({ windowMs: MINUTE, limit: 30 });
