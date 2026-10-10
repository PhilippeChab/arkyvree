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
    ["half-elf", "Half-elf"],
    ["human", "Human"],
  ])("reads the race %s as its reference stores it", (page, name) => {
    const races = stored("srd/races.json", "race").raw;
    expect(scraped(new RacePage(fixture(`race-${page}`)).read())).toEqual(races.find((race) => race.name === name)!);
  });

  test("skips the heading its listing adds to the frame, Races", () => {
    expect(new RacePage(page("Races", "Elf")).read()?.name).toBe("Elf");
  });

  test("reads no race on a page carrying only the site's heading", () => {
    expect(new RacePage(page("D&D Tools")).read()).toBeUndefined();
  });
});
