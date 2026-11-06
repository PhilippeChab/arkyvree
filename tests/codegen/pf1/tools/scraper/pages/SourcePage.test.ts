import { describe, expect, test } from "bun:test";

import { SourcePage } from "@/codegen/pf1/tools/scraper/pages/SourcePage.ts";
import { fixture } from "@/tests/support/pf1/scrapedPages.ts";

describe("A book's page", () => {
  const page = new SourcePage(fixture("book-core-rulebook"), "https://aonprd.com");

  test("lists the entries under a kind's heading, its count aside, each with its page's absolute URL", () => {
    expect(page.entries("Prestige Classes")).toEqual([
      { name: "Arcane Archer", url: "https://aonprd.com/PrestigeClassesDisplay.aspx?ItemName=Arcane%20Archer" },
      { name: "Arcane Trickster", url: "https://aonprd.com/PrestigeClassesDisplay.aspx?ItemName=Arcane%20Trickster" },
    ]);
  });

  test("lists an item of several bonuses once per bonus, each on its one page", () => {
    expect(page.entries("Magic Items (Wondrous Items)").map(({ name }) => name)).toEqual([
      "Cloak of Resistance (+1)",
      "Cloak of Resistance (+2)",
    ]);
  });

  test("lists no entry of a kind the book prints none of", () => {
    expect(page.entries("Spells")).toEqual([]);
  });
});
