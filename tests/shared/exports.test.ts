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
    // An emoji at the cut is kept whole, or left out whole
    expect(formatSheetFileName(`${"a".repeat(199)}🐉🐉`)).toBe(`${"a".repeat(199)}🐉-sheet.pdf`);
    expect(formatSheetFileName(`${"a".repeat(199)}👨‍👩‍👧🇫🇷`)).toBe(`${"a".repeat(199)}👨‍👩‍👧-sheet.pdf`);
  });

  test("cuts by code point where the runtime has no segmenter, an emoji of one kept whole", () => {
    const { Segmenter } = Intl;
    Reflect.set(Intl, "Segmenter", undefined);
    try {
      expect(formatSheetFileName(`${"a".repeat(199)}🐉🐉`)).toBe(`${"a".repeat(199)}🐉-sheet.pdf`);
    } finally {
      Reflect.set(Intl, "Segmenter", Segmenter);
    }
  });
});
