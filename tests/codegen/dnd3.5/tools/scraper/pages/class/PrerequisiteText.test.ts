import { describe, expect, test } from "bun:test";

import { PrerequisiteText } from "@/codegen/dnd3.5/tools/scraper/pages/class/PrerequisiteText.ts";

/** The feats the prerequisites' `text` gives. */
function featsOf(text: string) {
  return new PrerequisiteText(text).parsed().feats;
}

/** The special prerequisites the prerequisites' `text` gives. */
function specialsOf(text: string) {
  return new PrerequisiteText(text).parsed().special;
}

/** The Spells lines the prerequisites' `text` gives. */
function spellsOf(text: string) {
  return new PrerequisiteText(text).parsed().spells;
}

describe("A class's prerequisites' text", () => {
  test("gives each Spells line's text after its label, to its line's end or the next label the page joins to it", () => {
    expect(spellsOf("Race: Gnome.Feats: Any two item creation feats.Spells: Arcane caster level 5th.")).toEqual([
      "Arcane caster level 5th.",
    ]);
    expect(
      spellsOf(
        "Spells: Able to cast charm person, use charm person as a spell-like ability, or use the charm invocation.\n" +
          "Spells or Spell-Like Abilities: Arcane caster level 5th.",
      ),
    ).toEqual([
      "Able to cast charm person, use charm person as a spell-like ability, or use the charm invocation.",
      "Arcane caster level 5th.",
    ]);
    expect(
      spellsOf("Spells: Able to cast 1st-level divine spellsSpecial: Must have Heironeous as a patron deity."),
    ).toEqual(["Able to cast 1st-level divine spells"]);
    expect(spellsOf("Spellcasting: Ability to cast 3rd-level spells.Skill Tricks: Any two.")).toEqual([
      "Ability to cast 3rd-level spells.",
    ]);
  });

  test("gives none for a skill whose name starts with Spell", () => {
    expect(spellsOf("Skills: Spellcraft 8 ranks")).toBeUndefined();
  });

  test("gives each Special line's text, a page's line breaks (<br />) keeping its lines apart", () => {
    expect(
      specialsOf(
        "Feats: Weapon Focus (dagger), Two-Weapon Fighting\nSpecial: Arcane caster level 5th.\nSpecial: Sneak attack +1d6.",
      ),
    ).toEqual(["Arcane caster level 5th.", "Sneak attack +1d6."]);
  });

  test("gives the Feats line's feats, up to any Spells line's label", () => {
    expect(
      featsOf(
        "Feats: Great Fortitude, Toughness\nSpells or Spell-Like Abilities: Arcane caster level 5th.\nSpecial: The character must have been killed, then returned to life.",
      ),
    ).toEqual(["Great Fortitude", "Toughness"]);
    expect(featsOf("Feats: Any one metamagic feat.Spellcasting: Ability to cast 3rd-level spells.")).toEqual([
      "Any one metamagic feat",
    ]);
    expect(
      featsOf("Feats: Spell Focus (evocation), Spell Penetration\nSpells: Able to cast 2nd-level arcane spells."),
    ).toEqual(["Spell Focus (evocation)", "Spell Penetration"]);
  });
});
