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

  test("put those their base rules don't name after its own by name, whatever order they came in", () => {
    const names = ["Sanity", "Dexterity", "Force Points"];
    expect(sortAbilities(names, "Dungeons & Dragons: 3.5", (name) => name)).toEqual([
      "Dexterity",
      "Force Points",
      "Sanity",
    ]);
  });
});
