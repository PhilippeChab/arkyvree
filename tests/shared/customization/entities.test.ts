import { describe, expect, test } from "bun:test";

import { buildCustomizationPath, buildEntityPagePath, hasCustomizationPage } from "@/shared/customization/entities.ts";

/** The kinds whose customizations have a page of their own, as rules describe them: an owned kind's with its owner. */
const PAGES = new Map([
  ["perks", { type: "perks" }],
  ["owner-levels", { owner: "owners", type: "owner-levels" }],
]);

describe("customization page paths", () => {
  test("name an entity's page by its type", () => {
    expect(buildCustomizationPath("owner-levels", "id")).toBe("owner-levels/id/customization");
    expect(buildCustomizationPath("perks", "id")).toBe("perks/id/customization");
    expect(buildCustomizationPath("modifiers", "id")).toBe("modifiers/id/customization");
  });
});

describe("an entity's page in its ruleset", () => {
  test("is its customization page where its kind has one, a modifier's included, else its own", () => {
    expect(
      ["perks", "owner-levels", "modifiers", "owners", "tools"].map((type) => hasCustomizationPage(type, PAGES)),
    ).toEqual([true, true, true, false, false]);
    expect(buildEntityPagePath("r", "perks", "id", PAGES)).toBe("/rulesets/r/perks/id/customization");
    expect(buildEntityPagePath("r", "owner-levels", "id", PAGES)).toBe("/rulesets/r/owner-levels/id/customization");
    expect(buildEntityPagePath("r", "modifiers", "id", new Map())).toBe("/rulesets/r/modifiers/id/customization");
    expect(buildEntityPagePath("r", "owners", "id", PAGES)).toBe("/rulesets/r/owners/id");
    expect(buildEntityPagePath("r", "tools", "id", PAGES)).toBe("/rulesets/r/tools/id");
  });

  test("opens on a tab when given", () => {
    expect(buildEntityPagePath("r", "perks", "id", PAGES, "modifiers")).toBe(
      "/rulesets/r/perks/id/customization/modifiers",
    );
    expect(buildEntityPagePath("r", "modifiers", "id", PAGES, "requirements")).toBe(
      "/rulesets/r/modifiers/id/customization/requirements",
    );
    expect(buildEntityPagePath("r", "owners", "id", PAGES, "requirements")).toBe("/rulesets/r/owners/id/requirements");
  });
});
