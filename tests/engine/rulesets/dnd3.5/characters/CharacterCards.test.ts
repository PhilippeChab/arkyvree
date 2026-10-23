import { describe, expect, test } from "bun:test";

import CharacterCards from "@/engine/rulesets/dnd3.5/characters/CharacterCards.ts";

/** A ruleset's view as a card reads it: an Elf, and the first three levels of Fighter and of Rogue. */
const VIEW = {
  rulesetData: {
    klassesById: new Map([
      ["fighter", { name: "Fighter" }],
      ["rogue", { name: "Rogue" }],
    ]),
    klassLevelsById: new Map(
      ["fighter", "rogue"].flatMap((klassId) =>
        [1, 2, 3].map((level) => [`${klassId}-${level}`, { klassId, level }] as const),
      ),
    ),
    racesById: new Map([["elf", { name: "Elf" }]]),
  },
};

describe("A 3.5 character's card", () => {
  test("is its race's chip, which a partly seen character shows, then each class at its highest level", () => {
    const card = CharacterCards.describe(VIEW, { raceId: "elf" }, [
      { klassLevelId: "fighter-1" },
      { klassLevelId: "rogue-1" },
      { klassLevelId: "fighter-2" },
    ]);
    expect(card).toEqual({
      chips: [
        { label: "Elf", partial: true, tone: "secondary" },
        { label: "Fighter 2", partial: false, tone: "primary" },
        { label: "Rogue 1", partial: false, tone: "primary" },
      ],
      levels: [
        { klass: "Fighter", level: 2 },
        { klass: "Rogue", level: 1 },
      ],
      race: "Elf",
      totalLevel: 3,
    });
  });

  test("names a race it doesn't read Unknown, skips a level it doesn't read, and has no class without levels", () => {
    expect(CharacterCards.describe(VIEW, { raceId: "gone" }, [{ klassLevelId: "gone-1" }])).toEqual({
      chips: [{ label: "Unknown", partial: true, tone: "secondary" }],
      levels: [],
      race: "Unknown",
      totalLevel: 0,
    });
  });
});
