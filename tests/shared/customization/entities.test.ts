import { describe, expect, test } from "bun:test";

import { buildCustomizationPath } from "@/shared/customization/entities.ts";

describe("customization page paths", () => {
  test("name a class level's page class-levels, and every other entity's by its type", () => {
    expect(buildCustomizationPath("klass_levels", "id")).toBe("class-levels/id/customization");
    expect(buildCustomizationPath("feats", "id")).toBe("feats/id/customization");
    expect(buildCustomizationPath("modifiers", "id")).toBe("modifiers/id/customization");
  });
});
