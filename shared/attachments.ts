/** A record's image, by its slot's name: a user's avatar, a character's portrait. */
export type AttachmentSlotName = keyof typeof ATTACHMENT_SLOTS;

export const ALLOWED_IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"] as const;

/**
 * What a campaign's document's file may be: a picture of `ALLOWED_IMAGE_TYPES` or a PDF, its type read from its bytes.
 * Never an SVG or HTML, which a browser would run.
 */
export const ALLOWED_DOCUMENT_FILE_TYPES = [...ALLOWED_IMAGE_TYPES, "application/pdf"] as const;
/** The images records keep, by slot: the record type that takes it, and the slot's name the API reads it by. */
export const ATTACHMENT_SLOTS = {
  avatar: { name: "avatar", recordType: "User" },
  portrait: { name: "portrait", recordType: "Character" },
} as const;

/**
 * A campaign's document's file, private to whom the document admits: read through its document's route, never a public
 * URL, so it's no slot of `ATTACHMENT_SLOTS`, whose images any signed-in session reads.
 */
export const DOCUMENT_FILE_SLOT = { name: "file", recordType: "CampaignDocument" } as const;

/** The largest file a campaign's document takes. */
export const MAX_DOCUMENT_FILE_BYTES = 10 * 1024 * 1024;

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
