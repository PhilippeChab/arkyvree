/** A record's image, by its slot's name: a user's avatar, a character's portrait. */
export type AttachmentSlotName = keyof typeof ATTACHMENT_SLOTS;

export const ALLOWED_IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"] as const;

/** A Word document's type (`.docx`), which a browser can't show: its file is downloaded. */
export const WORD_DOCUMENT_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

/**
 * What a campaign's document's file may be: a picture of `ALLOWED_IMAGE_TYPES` or a PDF, its type read from its bytes,
 * a Word document (`DOCUMENT_WORD_EXTENSIONS`), a ZIP by its bytes and Word's by its name, or a text file
 * (`DOCUMENT_TEXT_EXTENSIONS`), served as plain text. Never an SVG or HTML, which a browser would run.
 */
export const ALLOWED_DOCUMENT_FILE_TYPES = [
  ...ALLOWED_IMAGE_TYPES,
  "application/pdf",
  WORD_DOCUMENT_TYPE,
  "text/plain",
] as const;

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

/** How a text file's name ends, which a campaign's document takes as plain text: its bytes have no signature. */
export const DOCUMENT_TEXT_EXTENSIONS = [".txt", ".md"] as const;

/** How a Word document's name ends, which a campaign's document takes as one: a ZIP's bytes say no more. */
export const DOCUMENT_WORD_EXTENSIONS = [".docx"] as const;

/** The largest file a campaign's document takes. */
export const MAX_DOCUMENT_FILE_BYTES = 25 * 1024 * 1024;

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

/** Whether a file's name ends with one of `extensions` (`DOCUMENT_TEXT_EXTENSIONS`, `DOCUMENT_WORD_EXTENSIONS`). */
export function isNamedAs(filename: string, extensions: readonly string[]) {
  return extensions.some((extension) => filename.toLowerCase().endsWith(extension));
}
