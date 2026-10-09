import { describe, expect, test } from "bun:test";

import { formatSheetFileName } from "@/shared/exports.ts";

describe("a sheet's file name", () => {
  test("is the character's name, what a file name can't hold replaced", () => {
    expect(formatSheetFileName("Ada")).toBe("Ada-sheet.pdf");
    expect(formatSheetFileName('Ada: "the <Bold>" / 2?')).toBe("Ada_ _the _Bold__ _ 2_-sheet.pdf");
  });

  test("names a character without a name, and cuts a long name short", () => {
    expect(formatSheetFileName("")).toBe("character-sheet.pdf");
    expect(formatSheetFileName("a".repeat(300))).toBe(`${"a".repeat(200)}-sheet.pdf`);
  });
});
