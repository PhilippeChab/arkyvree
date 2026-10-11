import { describe, expect, test } from "bun:test";

import { RacePage } from "@/codegen/dnd3.5/tools/scraper/pages/RacePage.ts";
import { fixture, scraped, stored } from "@/tests/support/dnd3.5/scrapedPages.ts";

/** A page of these headings, then a benefit. */
function page(...headings: string[]) {
  return `<html><body>${headings.map((h) => `<h2>${h}</h2>`).join("")}<h4>Benefit</h4><p>You gain a bonus.</p></body></html>`;
}

describe("A race's page", () => {
  test.each([
    ["dwarf", "Dwarf"],
    ["elf", "Elf"],
    // A trait it leaves outside a paragraph: its bonus languages
    ["gnome", "Gnome"],
    ["half-elf", "Half-elf"],
    ["human", "Human"],
  ])("reads the race %s as its reference stores it", (page, name) => {
    const races = stored("srd/races.json", "race").raw;
    expect(scraped(new RacePage(fixture(`race-${page}`)).read())).toEqual(races.find((race) => race.name === name)!);
  });

  test("reads a trait it leaves outside a paragraph: its bold name, then the text after it", () => {
    const html =
      "<html><body><h2>Gnome</h2><h3>Racial Traits</h3><p>Low-light Vision: A gnome sees far.</p>" +
      " <strong>Bonus Languages:</strong> Draconic, Dwarven, and Orc. Gnomes deal with elves." +
      "<p>Favored Class: Bard.</p></body></html>";
    expect(new RacePage(html).read()?.features).toEqual([
      { name: "Low-light Vision", description: "A gnome sees far." },
      { name: "Bonus Languages", description: "Draconic, Dwarven, and Orc. Gnomes deal with elves." },
      { name: "Favored Class", description: "Bard." },
    ]);
  });

  test("skips the heading its listing adds to the frame, Races", () => {
    expect(new RacePage(page("Races", "Elf")).read()?.name).toBe("Elf");
  });

  test("reads no race on a page carrying only the site's heading", () => {
    expect(new RacePage(page("D&D Tools")).read()).toBeUndefined();
  });
});
