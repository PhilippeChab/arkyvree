import { describe, expect, test } from "bun:test";

import CharacterCards from "@/engine/rulesets/dnd3.5/characters/CharacterCards.ts";

/** A ruleset's view as a card reads it, 3.5's: an Elf, and the first three levels of Fighter and of Rogue. */
const DATA = {
  classesById: new Map([
    ["fighter", { name: "Fighter" }],
    ["rogue", { name: "Rogue" }],
  ]),
  classLevelsById: new Map(
    ["fighter", "rogue"].flatMap((classId) =>
      [1, 2, 3].map((level) => [`${classId}-${level}`, { ownerId: classId, position: level }] as const),
    ),
  ),
  racesById: new Map([["elf", { name: "Elf" }]]),
};

describe("A 3.5 character's card", () => {
  test("is its race's chip, which a partly seen character shows, then each class at its highest level", () => {
    const card = CharacterCards.describe(DATA, { links: { race: "elf" } }, [
      { entryId: "fighter-1" },
      { entryId: "rogue-1" },
      { entryId: "fighter-2" },
    ]);
    expect(card).toEqual({
      chips: [
        { label: "Elf", partial: true, tone: "secondary" },
        { label: "Fighter 2", partial: false, tone: "primary" },
        { label: "Rogue 1", partial: false, tone: "primary" },
      ],
    });
  });

  test("names a race it doesn't read Unknown, skips a level it doesn't read, and has no class without levels", () => {
    expect(CharacterCards.describe(DATA, { links: { race: "gone" } }, [{ entryId: "gone-1" }])).toEqual({
      chips: [{ label: "Unknown", partial: true, tone: "secondary" }],
    });
  });
});
