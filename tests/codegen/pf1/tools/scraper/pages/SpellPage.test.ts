import { describe, expect, test } from "bun:test";

import { SpellPage } from "@/codegen/pf1/tools/scraper/pages/SpellPage.ts";
import { fixture } from "@/tests/support/pf1/scrapedPages.ts";

describe("A spell's page", () => {
  test("reads its stat block by label and its description, its mythic version left out", () => {
    const fireball = new SpellPage(fixture("spell-fireball"), "Fireball").read()!;
    expect(fireball.fields).toEqual({
      School: "evocation [fire]",
      Level: "arcanist 3, bloodrager 3, magus 3, occultist 3, sorcerer 3, wizard 3",
      "Casting Time": "1 standard action",
      Components: "V, S, M (a ball of bat guano and sulfur)",
      Range: "long (400 ft. + 40 ft./level)",
      Area: "20-ft.-radius spread",
      Duration: "instantaneous",
      "Saving Throw": "Reflex half",
      "Spell Resistance": "yes",
    });
    expect(fireball.description).toStartWith("A fireball spell generates a searing explosion of flame");
    expect(fireball.description).not.toContain("1d10");
  });
});
