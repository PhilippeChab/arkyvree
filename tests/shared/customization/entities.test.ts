import { describe, expect, test } from "bun:test";

import { buildCustomizationPath } from "@/shared/customization/entities.ts";

describe("customization page paths", () => {
  test("name an entity's page by its type's URL segment: a type of two words by both, hyphenated", () => {
    expect(buildCustomizationPath("owner_levels", "id")).toBe("owner-levels/id/customization");
    expect(buildCustomizationPath("perks", "id")).toBe("perks/id/customization");
    expect(buildCustomizationPath("modifiers", "id")).toBe("modifiers/id/customization");
  });
});
