import { describe, expect, test } from "bun:test";

import { PrerequisiteText } from "@/codegen/dnd3.5/tools/scraper/pages/class/PrerequisiteText.ts";

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
});
