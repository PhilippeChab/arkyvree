import { describe, expect, test } from "bun:test";

import { FeatPage } from "@/codegen/pf1/tools/scraper/pages/FeatPage.ts";
import { fixture } from "@/tests/support/pf1/scrapedPages.ts";

describe("A feat's page", () => {
  test("reads its types off its title and its sections, its combat trick left out", () => {
    const feat = new FeatPage(fixture("feat-power-attack"), "Power Attack").read()!;
    expect(feat).toMatchObject({
      name: "Power Attack",
      types: ["Combat"],
      sources: [{ book: "PRPG Core Rulebook", page: 131 }],
    });
    expect(feat.sections.map(({ label }) => label)).toEqual(["Prerequisites", "Benefit"]);
    expect(feat.sections[0].text).toBe("Str 13, base attack bonus +1.");
  });

  test("leaves out its opening line, which isn't open game content", () => {
    const html =
      '<html><body><div id="main"><h1 class="title">Keen Eye</h1><b>Source</b> <i>Book pg. 1</i><br />' +
      "You see far.<br /><br /><b>Benefit</b>: You gain a +2 bonus on Perception checks.</div></body></html>";
    const feat = new FeatPage(html).read()!;
    expect(feat.sections).toEqual([{ label: "Benefit", text: "You gain a +2 bonus on Perception checks." }]);
    expect(JSON.stringify(feat)).not.toContain("You see far");
  });

  test("takes its title without its types for its name when read alone", () => {
    expect(new FeatPage(fixture("feat-power-attack")).read()!).toMatchObject({
      name: "Power Attack",
      types: ["Combat"],
    });
  });
});
