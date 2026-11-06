import { describe, expect, test } from "bun:test";

import { ItemPage } from "@/codegen/pf1/tools/scraper/pages/ItemPage.ts";
import { fixture } from "@/tests/support/pf1/scrapedPages.ts";

describe("An item's page", () => {
  test("reads a weapon's statistics, an empty one's dash as nothing, and every book it's printed in", () => {
    const longsword = new ItemPage(fixture("weapon-longsword")).read()!;
    expect(longsword.sources).toEqual([
      { book: "Ultimate Equipment", page: 18 },
      { book: "PRPG Core Rulebook", page: 142 },
    ]);
    expect(longsword.fields).toEqual({
      Cost: "15 gp",
      Weight: "4 lbs.",
      Damage: "1d6 (small), 1d8 (medium)",
      Critical: "19-20/x2",
      Range: "",
      Type: "S",
      Special: "",
      Category: "One-Handed",
      Proficiency: "Martial",
      "Weapon Groups": "Blades, Heavy",
    });
    expect(longsword.description).toBe("This sword is about 3-1/2 feet in length.");
  });

  test("reads an armor's statistics, and a good's under its title, a later book's recipe for it left out", () => {
    expect(new ItemPage(fixture("armor-breastplate")).read()!.fields).toMatchObject({
      "Armor Bonus": "+6",
      "Max Dex Bonus": "+3",
      "Armor Check Penalty": "-4",
      "Arcane Spell Failure Chance": "25%",
    });
    expect(new ItemPage(fixture("goods-acid")).read()!.sections).toEqual([]);
    expect(new ItemPage(fixture("goods-acid")).read()!.fields).toEqual({
      Price: "10 gp",
      Weight: "1 lb.",
      Category: "Alchemical Weapons",
    });
  });

  test("reads a magic item's stat block and construction, its name its title's, its bonuses' prices as written", () => {
    const cloak = new ItemPage(fixture("wondrous-cloak-of-resistance")).read()!;
    expect(cloak.name).toBe("Cloak of Resistance");
    expect(cloak.fields).toMatchObject({ Aura: "faint abjuration", CL: "5th", Slot: "shoulders", Weight: "1 lb." });
    expect(cloak.fields.Price).toStartWith("1,000 gp (+1), 4,000 gp (+2)");
    expect(cloak.construction.Requirements).toStartWith("Craft Wondrous Item, resistance");
  });

  test("keeps an item's other sections apart, each under its heading, and reads its construction after them", () => {
    const ring = new ItemPage(fixture("ring-of-elemental-command")).read()!;
    expect(ring.sections.map(({ label }) => label)).toEqual(
      ["Air", "Earth", "Fire", "Water"].map((element) => `Ring of Elemental Command (${element})`),
    );
    expect(ring.description).not.toContain("Ring of Elemental Command (Air)");
    expect(ring.construction.Requirements).toStartWith("Forge Ring");
    expect(new ItemPage(fixture("weapon-longsword")).read()!.sections).toEqual([]);
  });
});
