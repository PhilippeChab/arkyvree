import { describe, expect, test } from "bun:test";

import { SpellPage } from "@/database/packages/dnd35-from-parser/tools/scraper/pages/SpellPage.ts";
import { fixture, scraped, stored, urlOf } from "@/tests/support/scrapedPages.ts";

describe("A spell's page", () => {
  test.each([
    ["acid-fog", "Acid Fog"],
    ["acid-splash", "Acid Splash"],
    ["aid", "Aid"],
    ["align-weapon", "Align Weapon"],
    ["animate-dead", "Animate Dead"],
    // Its slug is its URL's, bears-endurance, not its name's
    ["bears-endurance", "Bear's Endurance"],
  ])("reads the spell %s as its reference stores it", (page, name) => {
    const spells = stored("srd/spells.json", "spell").raw;
    expect(scraped(new SpellPage(fixture(`spell-${page}`), urlOf(`spell-${page}`)).read())).toEqual(
      spells.find((spell) => spell.name === name)!,
    );
  });

  test("reads no spell on a page carrying only the site's heading", () => {
    const html = "<html><body><h2>D&D Tools</h2><h4>Benefit</h4><p>You gain a bonus.</p></body></html>";
    expect(new SpellPage(html, "https://dndtools.net/spells/srd/fireball--1/").read()).toBeUndefined();
  });
});
