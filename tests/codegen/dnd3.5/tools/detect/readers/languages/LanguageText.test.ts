import { describe, expect, test } from "bun:test";

import { LanguageText } from "@/codegen/dnd3.5/tools/detect/readers/languages/LanguageText.ts";

/** What `text` says of languages. */
function read(text: string) {
  return new LanguageText(text).read();
}

describe("A race's traits' text", () => {
  test("names the languages it speaks from the start, in their order, and none of its bonus languages", () => {
    expect(
      read(
        "Dwarves are especially capable with stonework.⁣Automatic Languages: Common and Dwarven. Bonus Languages: " +
          "Giant, Gnome, Goblin, Orc, Terran, and Undercommon. Dwarves are familiar with the languages of their enemies.",
      ),
    ).toEqual({ automatic: ["Common", "Dwarven"], newLanguage: false });
    expect(read("⁣ Automatic Languages: Common and Gnome. Bonus Languages: Draconic, Dwarven, and Orc.")).toEqual({
      automatic: ["Common", "Gnome"],
      newLanguage: false,
    });
  });

  test("names none when it doesn't say", () => {
    expect(read("Low-light Vision: An elf can see twice as far as a human.")).toEqual({
      automatic: [],
      newLanguage: false,
    });
  });
});

describe("A class's languages' text", () => {
  test("names a secret language its members know, and none of its bonus languages", () => {
    expect(
      read(
        "A druid's bonus language options include Sylvan, the language of woodland creatures. A druid also knows " +
          "Druidic, a secret language known only to druids. Druidic is a free language for a druid.",
      ),
    ).toEqual({ automatic: ["Druidic"], newLanguage: false });
    expect(
      read(
        "A cleric's bonus language options include Celestial, Abyssal, and Infernal (the languages of good, chaotic " +
          "evil, and lawful evil outsiders, respectively).",
      ),
    ).toEqual({ automatic: [], newLanguage: false });
  });

  test("gives a new language of any kind when it says so", () => {
    expect(read("A loremaster can choose any new language at 4th and 8th level.").newLanguage).toBe(true);
    expect(read("At 3rd level and again at 6th level, a guildmage learns a new language.").newLanguage).toBe(true);
  });
});
