import { describe, expect, test } from "bun:test";

import { buildCustomizationPath } from "@/shared/customization/entities.ts";

describe("customization page paths", () => {
  test("name an entity's page by its type", () => {
    expect(buildCustomizationPath("owner-levels", "id")).toBe("owner-levels/id/customization");
    expect(buildCustomizationPath("perks", "id")).toBe("perks/id/customization");
    expect(buildCustomizationPath("modifiers", "id")).toBe("modifiers/id/customization");
  });
});
