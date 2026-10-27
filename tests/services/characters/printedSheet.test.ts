import { describe, expect, test } from "bun:test";

import { UnprocessableEntityError } from "@/server/errors/index.ts";
import { toSheetFile } from "@/server/services/characters/printedSheet.ts";

describe("toSheetFile", () => {
  test("names a rendered sheet after its character, and refuses one over 10 MB", () => {
    const limit = 10 * 1024 * 1024;
    expect(toSheetFile(new ArrayBuffer(limit), "Ada: Draft/1")).toMatchObject({ fileName: "Ada_ Draft_1-sheet.pdf" });
    expect(() => toSheetFile(new ArrayBuffer(limit + 1), "Ada")).toThrow(UnprocessableEntityError);
  });
});
