/**
 * An import's file, measured as the server measures it: up to `MAX_IMPORT_FILE_LENGTH` characters, counted by code
 * points, as its schema counts them.
 */

import { MAX_IMPORT_FILE_LENGTH } from "@/shared/characters.ts";

/** A UTF-8 file's byte-order mark, which reading it as text drops: three bytes. */
const BYTE_ORDER_MARK_BYTES = 3;

/** The most bytes UTF-8 writes a character (a code point) in: four, an emoji's. */
const MAX_CHARACTER_BYTES = 4;

/**
 * Whether a file of `size` bytes holds more characters than an import reads, whatever they are: read as UTF-8 text,
 * each takes four bytes at most, past a byte-order mark. Such a file isn't read at all.
 */
export function isTooLargeToRead(size: number) {
  return size > BYTE_ORDER_MARK_BYTES + MAX_CHARACTER_BYTES * MAX_IMPORT_FILE_LENGTH;
}

/**
 * Whether a file's text holds more characters than an import reads, counted as the server's schema counts them, by
 * code points: an emoji is one, though it's two of the text's units.
 */
export function isTooLongToImport(text: string) {
  return [...text].length > MAX_IMPORT_FILE_LENGTH;
}
