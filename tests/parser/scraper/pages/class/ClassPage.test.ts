import { describe, expect, test } from "bun:test";

import { ClassPage } from "@/database/packages/dnd35-from-parser/tools/scraper/pages/class/ClassPage.ts";
import { fixture, scraped, stored, urlOf } from "@/tests/support/scrapedPages.ts";

describe("A class's page", () => {
  test.each([
    ["barbarian", "srd"],
    ["cleric", "srd"],
    ["sorcerer", "srd"],
    ["wizard", "srd"],
    // Its table's other columns, each named by the header over it too: "AC" over "Bonus"
    ["monk", "srd"],
    ["assassin", "dmg"],
    ["urPriest", "complete-divine"],
    ["shadowmind", "complete-adventurer"],
    ["vigilante", "complete-adventurer"],
  ])("reads the class %s as its reference stores it", (page, book) => {
    const klass = stored(`${book}/classes/${page}.json`, "class");
    // The saved page is the one the reference was scraped from
    expect(urlOf(`class-${page}`)).toBe(klass._meta.sourceUrl);
    expect(scraped(new ClassPage(fixture(`class-${page}`)).read())).toEqual(klass.raw);
  });

  test("reads a page carrying only the site's heading as a class named after that heading", () => {
    expect(new ClassPage("<html><body><h2>Welcome</h2></body></html>").read().name).toBe("Welcome");
  });
});
