import { describe, expect, test } from "bun:test";

import { normalizeDescription } from "@/codegen/dnd3.5/tools/text/scrapedText.ts";

describe("A description", () => {
  test("is kept whole, however long, its whitespace normalized", () => {
    const sentence = "A wild shape lasts 1 hour per druid level, or until she changes back.";
    const long = Array.from({ length: 60 }, () => sentence).join("\n  ");
    const description = normalizeDescription(long);
    expect(description.length).toBeGreaterThan(2000);
    expect(description).toBe(Array.from({ length: 60 }, () => sentence).join(" "));
    expect(description.endsWith("back.")).toBe(true);
  });
});
