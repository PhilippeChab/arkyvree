import { describe, expect, test } from "bun:test";

import References from "@/codegen/dnd5/tools/references/References.ts";
import { BackgroundSeeds } from "@/codegen/dnd5/tools/seeds/BackgroundSeeds.ts";
import { ItemSeeds } from "@/codegen/dnd5/tools/seeds/ItemSeeds.ts";
import { CORE_BOOK } from "@/vocabulary/dnd5/books.ts";

/** The book's backgrounds' seeds, their tools the book's. */
function readBackgrounds() {
  const tools = new ItemSeeds(References.load(References.path(CORE_BOOK, "item"), "item")).tools();
  return new BackgroundSeeds(References.load(References.path(CORE_BOOK, "background"), "background"), tools);
}

describe("The SRD 5.2.1's backgrounds, as the generator reads them", () => {
  test("grant a background's Origin feat, skills and tool, or room in its tools' pool, and its spreads' pool", () => {
    const backgrounds = readBackgrounds().seeds();
    const described = (name: string) =>
      backgrounds
        .find((background) => background.name === name)!
        .modifiers.map(({ operator, target, value }) => `${target} ${operator} ${value}`);
    // The Sage's Magic Initiate is the Wizard's, its override's
    expect(described("Sage")).toEqual([
      "feats.magicinitiatewizard.possessed set true",
      "feats.skillproficiencyarcana.possessed set true",
      "feats.skillproficiencyhistory.possessed set true",
      "feats.toolproficiencycalligrapherssupplies.possessed set true",
      "aptitudes.sageabilityscores.allowed add 1",
    ]);
    // A choice of gaming sets: a pick in its tools' pool
    expect(described("Soldier")).toContain("aptitudes.soldiertools.allowed add 1");
    // Its three abilities named in its description, which its pool's feats raise
    expect(backgrounds.find(({ name }) => name === "Soldier")?.description).toContain(
      "Ability Scores: Strength, Dexterity, Constitution.",
    );
    expect(readBackgrounds().toolPicks()).toEqual([
      { pool: "Soldier Tools", tools: ["Dice", "Dragonchess", "Playing Cards", "Three-Dragon Ante"] },
    ]);
  });

  test("make its seven ways to spread its increases a feat each: +2 and +1, or +1 to each", () => {
    const feats = readBackgrounds().feats();
    expect(feats).toHaveLength(4 * 7);
    expect(feats.find(({ name }) => name === "Sage: Constitution +1, Intelligence +1, Wisdom +1")).toMatchObject({
      aptitudes: ["Sage Ability Scores"],
      modifiers: [
        { target: "abilities.constitution.misc", value: "1" },
        { target: "abilities.intelligence.misc", value: "1" },
        { target: "abilities.wisdom.misc", value: "1" },
      ],
    });
    expect(feats.find(({ name }) => name === "Soldier: Strength +2, Dexterity +1")?.modifiers).toMatchObject([
      { target: "abilities.strength.misc", value: "2" },
      { target: "abilities.dexterity.misc", value: "1" },
    ]);
  });
});
