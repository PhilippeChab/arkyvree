import { describe, expect, test } from "bun:test";

import { expandTemplateDescription, normalizeDescription } from "@/codegen/dnd3.5/tools/text/scrapedText.ts";

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

describe("A weapon template's description", () => {
  test("names the weapon where its text says the selected one", () => {
    expect(expandTemplateDescription("+1 on attack rolls you make using the selected weapon.", "weapon", "Club")).toBe(
      "+1 on attack rolls you make using Club.",
    );
    expect(expandTemplateDescription("When using the weapon you selected, …", "weapon", "Club")).toBe(
      "When using Club, …",
    );
    expect(expandTemplateDescription("The selected weapon deals …", "crossbow", "Heavy Crossbow")).toBe(
      "Heavy Crossbow deals …",
    );
  });

  test("keeps a feat's name that opens with Weapon", () => {
    const description =
      "Your successful sneak attack with a slashing weapon for which you have selected Weapon Focus …";
    expect(expandTemplateDescription(description, "weapon", "Club")).toBe(description);
  });
});
