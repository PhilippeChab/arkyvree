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

  test("that prints several spells reads each listed one off its own section, by its title", () => {
    const heal = new SpellPage(fixture("spell-heal"), "Heal").read()!;
    const massHeal = new SpellPage(fixture("spell-heal"), "Heal, Mass").read()!;
    expect(heal).toMatchObject({ name: "Heal", sources: [{ book: "PRPG Core Rulebook", page: 294 }] });
    expect(heal.fields).toMatchObject({ Level: expect.stringContaining("cleric 6"), Range: "touch" });
    expect(heal.description).toStartWith("Heal enables you to channel positive energy");
    expect(heal.description).not.toContain("15 points");
    expect(massHeal).toMatchObject({ name: "Heal, Mass", sources: [{ book: "PRPG Core Rulebook", page: 294 }] });
    expect(massHeal.fields).toMatchObject({ Level: "cleric 9, oracle 9, shaman 9", Targets: expect.any(String) });
    expect(massHeal.description).toStartWith("This spell functions like heal");
  });

  test("matches a listed name to its title as the site writes it: a closing numeral, a degree after the name", () => {
    expect(new SpellPage(fixture("spell-heal"), "Mass Heal").read()!.fields.Level).toBe("cleric 9, oracle 9, shaman 9");
    const html = fixture("spell-heal").replace("> Heal, Mass<", "> Summon Monster III<");
    expect(new SpellPage(html, "Summon Monster 3").read()!.fields.Level).toBe("cleric 9, oracle 9, shaman 9");
    expect(new SpellPage(html, "Summon Monster 4").read()).toBeUndefined();
  });
});
