import { describe, expect, test } from "bun:test";

import { RacePage } from "@/codegen/pf1/tools/scraper/pages/RacePage.ts";
import { fixture } from "@/tests/support/pf1/scrapedPages.ts";

describe("A race's page", () => {
  test("reads its racial traits, by the name its book lists it under", () => {
    const dwarf = new RacePage(fixture("race-dwarf"), "Dwarf").read()!;
    expect(dwarf.name).toBe("Dwarf");
    expect(dwarf.traits.slice(0, 2)).toEqual([
      {
        label: "+2 Constitution, +2 Wisdom, –2 Charisma",
        text: "Dwarves are both tough and wise, but also a bit gruff.",
      },
      { label: "Medium", text: "Dwarves are Medium creatures and have no bonuses or penalties due to their size." },
    ]);
    expect(dwarf.traits.at(-1)?.label).toBe("Languages");
  });

  test("leaves out its description and its paragraphs, which aren't open game content", () => {
    const html =
      '<html><body><div id="main"><h1 class="title">Wanderers</h1><b>Source</b> <i>Book pg. 1</i><br />' +
      "Wanderers roam.<br /><br /><b>Society</b>: They gather at dusk." +
      '<h1 class="title">Wanderer Racial Traits</h1><b>Medium</b>: Wanderers are Medium creatures.</div></body></html>';
    const wanderer = new RacePage(html, "Wanderer").read()!;
    expect(wanderer.traits).toEqual([{ label: "Medium", text: "Wanderers are Medium creatures." }]);
    expect(JSON.stringify(wanderer)).not.toMatch(/roam|dusk/);
  });
});
