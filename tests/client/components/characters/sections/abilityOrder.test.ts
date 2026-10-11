import { describe, expect, test } from "bun:test";

import { sortAbilities } from "@/client/src/components/characters/sections/abilityOrder.ts";

describe("Abilities", () => {
  test("follow their base rules' order, unknown ones last", () => {
    const names = ["Wisdom", "Luck", "strength", "Charisma"];
    expect(sortAbilities(names, "Dungeons & Dragons: 3.5", (name) => name)).toEqual([
      "strength",
      "Wisdom",
      "Charisma",
      "Luck",
    ]);
  });
});
