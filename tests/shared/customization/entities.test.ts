import { describe, expect, test } from "bun:test";

import { buildCustomizationPath, parseCustomizationSegment } from "@/shared/customization/entities.ts";

describe("customization page paths", () => {
  test("name a class level's page class-levels, and every other entity's by its type", () => {
    expect(buildCustomizationPath("klass_levels", "id")).toBe("class-levels/id/customization");
    expect(buildCustomizationPath("feats", "id")).toBe("feats/id/customization");
  });

  test("read an entity type back from its segment, or from its database name for links made before", () => {
    expect([parseCustomizationSegment("class-levels"), parseCustomizationSegment("klass_levels")]).toEqual([
      "klass_levels",
      "klass_levels",
    ]);
    expect(parseCustomizationSegment("modifiers")).toBe("modifiers");
    expect([parseCustomizationSegment("classes"), parseCustomizationSegment(undefined)]).toEqual([
      undefined,
      undefined,
    ]);
  });
});
