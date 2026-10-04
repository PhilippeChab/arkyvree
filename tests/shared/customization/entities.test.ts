import { describe, expect, test } from "bun:test";

import { buildCustomizationPath, parseCustomizationSegment } from "@/shared/customization/entities.ts";

describe("customization page paths", () => {
  test("name a class level's page class-levels, and every other entity's by its type", () => {
    expect(buildCustomizationPath("klass_levels", "id")).toBe("class-levels/id/customization");
    expect(buildCustomizationPath("feats", "id")).toBe("feats/id/customization");
  });

  test("read an entity type back from its segment, not from the database's name", () => {
    expect([parseCustomizationSegment("class-levels"), parseCustomizationSegment("klass_levels")]).toEqual([
      "klass_levels",
      undefined,
    ]);
    expect(parseCustomizationSegment("modifiers")).toBe("modifiers");
    expect([parseCustomizationSegment("classes"), parseCustomizationSegment(undefined)]).toEqual([
      undefined,
      undefined,
    ]);
  });
});
