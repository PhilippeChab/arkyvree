import { limitRate, limitRatePerUser } from "./limitRate.ts";

/** The direct uploads a minute: the app's per address, the public API's per user. */
const ATTACHMENT_UPLOADS_PER_MINUTE = 20;

/** The PDFs a minute an export renders: the app's per address, the public API's per user. */
const EXPORTS_PER_MINUTE = 5;

const MINUTE = 60 * 1000;

/**
 * The public API's requests from an address, before its key is looked up: a wrong key or none is a lookup by digest,
 * which nothing counted. Past every user's own limit, for a server that calls it for several users. The address is
 * read as the app's limits read it, the first `X-Forwarded-For` entry, which a client can set: it bounds a client
 * that sends its own, not one that names another's.
 */
export const apiAddressRateLimit = limitRate({ windowMs: MINUTE, limit: 600 });

/**
 * The public API's image uploads, counted per user, whatever keys of theirs ask: as many a minute as the app's own
 * allow an address, each stored through the server.
 */
export const apiAttachmentUploadRateLimit = limitRatePerUser({
  windowMs: MINUTE,
  limit: ATTACHMENT_UPLOADS_PER_MINUTE,
  headers: false,
});

/**
 * The public API's PDFs, rendered or queued, counted per user, whatever keys of theirs ask: as many a minute as the
 * app's own allow an address, each costing a render.
 */
export const apiExportRateLimit = limitRatePerUser({ windowMs: MINUTE, limit: EXPORTS_PER_MINUTE, headers: false });

/**
 * The public API's requests, counted per user, whatever keys of theirs ask: an agent's run reads a character and its
 * choices a few times a level. Per user, a user's ten keys get no more than one.
 */
export const apiKeyRateLimit = limitRatePerUser({ windowMs: MINUTE, limit: 120 });

/**
 * Each direct-upload commits a blob row + S3 object that the sweep won't reclaim until UNATTACHED_BLOB_TTL_MS
 * (server/jobs/sweepPendingBlobs.ts) after creation. Cap per-IP creation rate so a single scripted client can't bloat storage at
 * will.
 */
export const attachmentUploadRateLimit = limitRate({ windowMs: MINUTE, limit: ATTACHMENT_UPLOADS_PER_MINUTE });

export const authEmailRateLimit = limitRate({ windowMs: 15 * MINUTE, limit: 10, per: "email" });

export const authRateLimit = limitRate({ windowMs: 15 * MINUTE, limit: 15 });

export const authSessionRateLimit = limitRate({ windowMs: 15 * MINUTE, limit: 60 });

export const exportRateLimit = limitRate({ windowMs: MINUTE, limit: EXPORTS_PER_MINUTE });

/** An import reads a whole character file and builds the character level by level: a few a minute is plenty. */
export const importRateLimit = limitRate({ windowMs: MINUTE, limit: 10 });

/** What a picked character file is: asked once a file is picked, its header's tags read, nothing built. */
export const importSourceRateLimit = limitRate({ windowMs: MINUTE, limit: 30 });

export const publicApiRateLimit = limitRate({ windowMs: MINUTE, limit: 30 });
