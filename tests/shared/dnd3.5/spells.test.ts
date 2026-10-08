import { describe, expect, test } from "bun:test";

import { formatSpellLevel, SPELL_LEVELS } from "@/shared/dnd3.5/spells.ts";

describe("formatSpellLevel", () => {
  test("names level 0 Cantrips, and every other level by its number", () => {
    expect(SPELL_LEVELS.map(formatSpellLevel)).toEqual([
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
