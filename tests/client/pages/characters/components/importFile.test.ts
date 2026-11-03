import { describe, expect, test } from "bun:test";

import { z } from "zod";

import { isTooLargeToRead, isTooLongToImport } from "@/client/src/pages/characters/components/importFile.ts";
import { MAX_IMPORT_FILE_LENGTH } from "@/shared/characters.ts";

/** A UTF-8 file's byte-order mark, which reading the file as text drops. */
const BYTE_ORDER_MARK = "\uFEFF";

/** What the import's routes take of a file: its text, counted by the server's schema. */
const IMPORT_TEXT = z.string().min(1).max(MAX_IMPORT_FILE_LENGTH);

describe("an import's file", () => {
  // Each emoji is four bytes in the file and one character to the server, though it's two of the text's units
  test.each([
    ["letters at the bound", "a".repeat(MAX_IMPORT_FILE_LENGTH), true],
    ["letters past it", "a".repeat(MAX_IMPORT_FILE_LENGTH + 1), false],
    ["emoji at the bound, each one character", "🐉".repeat(MAX_IMPORT_FILE_LENGTH), true],
    ["emoji at the bound after a byte-order mark", `${BYTE_ORDER_MARK}${"🐉".repeat(MAX_IMPORT_FILE_LENGTH)}`, true],
    ["emoji past it", "🐉".repeat(MAX_IMPORT_FILE_LENGTH + 1), false],
  ] as const)("of %s is read and sent as the server's schema takes it", async (_, written, taken) => {
    const file = new File([written], "character.pcg");
    const text = await file.text();

    expect(IMPORT_TEXT.safeParse(text).success).toBe(taken);
    expect(!isTooLargeToRead(file.size) && !isTooLongToImport(text)).toBe(taken);
  });

  test("isn't read when its bytes hold more characters than an import reads, whatever they are", () => {
    const mostBytes = 3 + 4 * MAX_IMPORT_FILE_LENGTH;

    expect(isTooLargeToRead(mostBytes)).toBe(false);
    expect(isTooLargeToRead(mostBytes + 1)).toBe(true);
  });
});
