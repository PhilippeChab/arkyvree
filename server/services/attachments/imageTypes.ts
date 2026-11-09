/** The type an upload's bytes say it is (an image, a document's file), which its declared type can't change. */

import {
  type ALLOWED_DOCUMENT_FILE_TYPES,
  type ALLOWED_IMAGE_TYPES,
  DOCUMENT_TEXT_EXTENSIONS,
} from "@/shared/attachments.ts";

/** A type a campaign's document's file may be. */
type AllowedDocumentFileType = (typeof ALLOWED_DOCUMENT_FILE_TYPES)[number];

/** An image type an upload may be. */
type AllowedImageType = (typeof ALLOWED_IMAGE_TYPES)[number];

/** The bytes a PDF opens with: `%PDF-`. */
const PDF_SIGNATURE = [0x25, 0x50, 0x44, 0x46, 0x2d];

/**
 * Each allowed image type by the bytes its files hold, each run at its offset: a WebP is a RIFF file whose form is
 * `WEBP`. Keyed by the allowed types, so one allowed without its signature doesn't compile.
 */
const SIGNATURES: Record<AllowedImageType, readonly (readonly [offset: number, bytes: readonly number[]])[]> = {
  "image/png": [[0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]]],
  "image/jpeg": [[0, [0xff, 0xd8, 0xff]]],
  "image/gif": [[0, [0x47, 0x49, 0x46, 0x38]]],
  "image/webp": [
    [0, [0x52, 0x49, 0x46, 0x46]],
    [8, [0x57, 0x45, 0x42, 0x50]],
  ],
};

/**
 * Whether a file's bytes are text: UTF-8, with no control character but its tabs and line ends, which a binary file
 * holds.
 */
function isText(data: Uint8Array) {
  try {
    return !/[\p{Cc}--[\t\n\r\f]]/v.test(new TextDecoder("utf-8", { fatal: true }).decode(data));
  } catch {
    return false;
  }
}

/**
 * The type of a campaign's document's file: the one its bytes open with (an image's, or a PDF's), or plain text for a
 * file named as one (`filename`: `DOCUMENT_TEXT_EXTENSIONS`) whose bytes are text; null for any other file.
 */
export function detectDocumentFileType(data: Uint8Array, filename: string): AllowedDocumentFileType | null {
  if (PDF_SIGNATURE.every((byte, i) => data[i] === byte)) return "application/pdf";
  const image = detectImageType(data);
  if (image) return image;
  const named = DOCUMENT_TEXT_EXTENSIONS.some((extension) => filename.toLowerCase().endsWith(extension));
  return named && isText(data) ? "text/plain" : null;
}

/** The image type a file's bytes open with (PNG, JPEG, GIF, WebP), or null for any other file. */
export function detectImageType(data: Uint8Array): AllowedImageType | null {
  const match = Object.entries(SIGNATURES).find(([, runs]) =>
    runs.every(([offset, bytes]) => bytes.every((byte, i) => data[offset + i] === byte)),
  );
  return (match?.[0] as AllowedImageType | undefined) ?? null;
}
