/** A record's image, by its slot's name: a user's avatar, a character's portrait. */
export type AttachmentSlotName = keyof typeof ATTACHMENT_SLOTS;

export const ALLOWED_IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"] as const;
/** The images records keep, by slot: the record type that takes it, and the slot's name the API reads it by. */
export const ATTACHMENT_SLOTS = {
  avatar: { name: "avatar", recordType: "User" },
  portrait: { name: "portrait", recordType: "Character" },
} as const;

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

/**
 * How long an unattached blob (uploaded but never confirmed) lives before
 * the sweep reclaims it. Bounds the cost of the
 * declared-byteSize-vs-actual-PUT abuse window. Long enough to give clients
 * room to retry attach() if the network glitches.
 */
export const UNATTACHED_BLOB_TTL_MS = 60 * 60 * 1000;
