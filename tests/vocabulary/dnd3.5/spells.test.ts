import { describe, expect, test } from "bun:test";

import { SPELL_LEVEL_LABELS, SPELL_LEVELS } from "@/vocabulary/dnd3.5/spells.ts";

describe("A spell level's name", () => {
  test("is Cantrips for level 0, and every other level's its number", () => {
    expect(SPELL_LEVELS.map((level) => SPELL_LEVEL_LABELS[level])).toEqual([
      "Cantrips",
      "Level 1",
      "Level 2",
      "Level 3",
      "Level 4",
      "Level 5",
      "Level 6",
      "Level 7",
      "Level 8",
      "Level 9",
    ]);
  });
});
