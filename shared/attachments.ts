export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
export const ALLOWED_IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"] as const;

/**
 * How long an unattached blob (uploaded but never confirmed) lives before
 * the sweep reclaims it. Bounds the cost of the
 * declared-byteSize-vs-actual-PUT abuse window. Long enough to give clients
 * room to retry attach() if the network glitches.
 */
export const UNATTACHED_BLOB_TTL_MS = 60 * 60 * 1000;
