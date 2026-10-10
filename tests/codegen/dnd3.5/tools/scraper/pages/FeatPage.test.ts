import { describe, expect, test } from "bun:test";

import { FeatPage } from "@/codegen/dnd3.5/tools/scraper/pages/FeatPage.ts";
import { fixture, scraped, stored } from "@/tests/support/scrapedPages.ts";

describe("A feat's page", () => {
  test.each([
    ["acrobatic", "srd", "Acrobatic"],
    ["armor-proficiency-heavy", "srd", "Armor Proficiency (heavy)"],
    ["brew-potion", "srd", "Brew Potion"],
    // In two categories: Fighter Bonus Feat and General
    ["cleave", "srd", "Cleave"],
    // Epic, though also Divine
    ["zone-of-animation", "complete-divine", "Zone of Animation"],
    // A skill trick, though first a movement one
    ["walk-the-walls", "complete-scoundrel", "Walk the Walls"],
  ])("reads the feat %s as its reference stores it", (page, book, name) => {
    const feats = stored(`${book}/feats.json`, "feat").raw;
    expect(scraped(new FeatPage(fixture(`feat-${page}`)).read())).toEqual(feats.find((feat) => feat.name === name)!);
  });

  test("reads no feat on a page carrying only the site's heading", () => {
    expect(
      new FeatPage("<html><body><h2>D&D Tools</h2><h4>Benefit</h4><p>You gain a bonus.</p></body></html>").read(),
    ).toBeUndefined();
  });
});
