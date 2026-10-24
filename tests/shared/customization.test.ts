import { describe, expect, test } from "bun:test";

import { formatPropertyType } from "@/shared/customization/properties.ts";
import { deriveSegmentLabels, formatSegment } from "@/shared/customization/target.ts";

describe("A path segment's label", () => {
  test("splits camel case and capitalizes", () => {
    expect(formatSegment("privateNotes")).toBe("Private Notes");
    expect(formatSegment("strength")).toBe("Strength");
  });

  test("is its override, else the segment formatted, for every segment of the paths", () => {
    expect(
      deriveSegmentLabels([{ path: "saves.fortitude.misc" }, { path: "saves.will.total" }], { misc: "Miscellaneous" }),
    ).toEqual({ saves: "Saves", fortitude: "Fortitude", misc: "Miscellaneous", will: "Will", total: "Total" });
  });
});

describe("Customizations", () => {
  test("label a property type from its constant's name", () => {
    expect(formatPropertyType("SPELL_SCHOOL")).toBe("Spell School");
    expect(formatPropertyType("FEAT_FAMILY")).toBe("Feat Family");
  });
});
