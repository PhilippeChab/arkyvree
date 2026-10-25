import { describe, expect, test } from "bun:test";

import { deriveSegmentLabels, formatSegment } from "@/shared/customization/target.ts";

describe("A path segment's label", () => {
  test("splits camel case and capitalizes", () => {
    expect(formatSegment("privateNotes")).toBe("Private Notes");
    expect(formatSegment("strength")).toBe("Strength");
  });

  test("is its override, else the segment formatted, for every segment of the paths", () => {
    expect(
      deriveSegmentLabels([{ path: "traits.grit.misc" }, { path: "traits.will.total" }], { misc: "Miscellaneous" }),
    ).toEqual({ traits: "Traits", grit: "Grit", misc: "Miscellaneous", will: "Will", total: "Total" });
  });
});
