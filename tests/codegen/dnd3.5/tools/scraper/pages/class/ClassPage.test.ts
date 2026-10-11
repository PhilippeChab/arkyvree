import { describe, expect, test } from "bun:test";

import { ClassPage } from "@/codegen/dnd3.5/tools/scraper/pages/class/ClassPage.ts";
import { fixture, scraped, stored, urlOf } from "@/tests/support/dnd3.5/scrapedPages.ts";

/** A committed class reference, as the scraper stored it. */
function klassOf(book: string, page: string) {
  return stored(`${book}/classes/${page}.json`, "class");
}

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
    const klass = klassOf(book, page);
    // The saved page is the one the reference was scraped from
    expect(urlOf(`class-${page}`)).toBe(klass._meta.sourceUrl);
    expect(scraped(new ClassPage(fixture(`class-${page}`)).read())).toEqual(klass.raw);
  });

  test("reads its languages: its Bonus Languages paragraph past its name, and those continuing it, up to the next feature", () => {
    const html =
      "<html><body><h2>Site</h2><h2>Druid</h2><h4>Class Features</h4>" +
      "<p><strong>Spells</strong>: A druid casts divine spells.</p>" +
      "<p><strong>Bonus Languages</strong>: A druid's bonus language options include Sylvan.</p>" +
      "<p>A druid also knows Druidic, a secret language known only to druids.</p>" +
      "<p><strong>Animal Companion (Ex)</strong>: A druid may begin play with an animal companion.</p>" +
      "<p>A companion is typical for its kind.</p></body></html>";
    expect(new ClassPage(html).read().languages).toBe(
      "A druid's bonus language options include Sylvan. A druid also knows Druidic, a secret language known only to druids.",
    );
    expect(klassOf("srd", "cleric").raw.languages).toStartWith("A cleric's bonus language options include Celestial");
  });

  test("reads no languages when its Class Features section gives none", () => {
    expect(new ClassPage(fixture("class-barbarian")).read().languages).toBeUndefined();
  });

  test("reads a page carrying only the site's heading as a class named after that heading", () => {
    expect(new ClassPage("<html><body><h2>Welcome</h2></body></html>").read().name).toBe("Welcome");
  });
});
