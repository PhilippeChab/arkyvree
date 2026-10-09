/** A record's image, by its slot's name: a user's avatar, a character's portrait. */
export type AttachmentSlotName = keyof typeof ATTACHMENT_SLOTS;

export const ALLOWED_IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"] as const;
/** The images records keep, by slot: the record type that takes it, and the slot's name the API reads it by. */
export const ATTACHMENT_SLOTS = {
  avatar: { name: "avatar", recordType: "User" },
  portrait: { name: "portrait", recordType: "Character" },
} as const;

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
