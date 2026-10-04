import { describe, expect, test } from "bun:test";

import {
  customizationPath,
  entityTypeOfSegment,
} from "@/client/src/pages/rulesets/customization/customizationPaths.ts";

describe("customization paths", () => {
  test("name a class level's page class-levels, and every other entity's by its type", () => {
    expect(customizationPath("klass_levels", "id")).toBe("class-levels/id/customization");
    expect(customizationPath("feats", "id")).toBe("feats/id/customization");
  });

  test("read an entity type back from its segment, or from its database name for links made before", () => {
    expect([entityTypeOfSegment("class-levels"), entityTypeOfSegment("klass_levels")]).toEqual([
      "klass_levels",
      "klass_levels",
    ]);
    expect(entityTypeOfSegment("modifiers")).toBe("modifiers");
    expect([entityTypeOfSegment("classes"), entityTypeOfSegment(undefined)]).toEqual([undefined, undefined]);
  });
});
