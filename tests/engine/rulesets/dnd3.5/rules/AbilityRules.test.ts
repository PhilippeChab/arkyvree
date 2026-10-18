import { describe, expect, test } from "bun:test";

import AbilityRules from "@/engine/rulesets/dnd3.5/rules/AbilityRules.ts";

describe("3.5's abilities", () => {
  test("give +1 to their modifier for every 2 points above 10, rounded down", () => {
    expect([1, 8, 9, 10, 11, 12, 18].map((score) => AbilityRules.computeModifier(score))).toEqual([
      -5, -1, -1, 0, 0, 1, 4,
    ]);
  });

  test("are listed the books' six first, in their order, then the others by name, whatever order they came in", () => {
    const names = ["Sanity", "Charisma", "2", "Force Points", "Strength", "Dexterity"];
    expect(AbilityRules.orderAbilities(names, (name) => name)).toEqual([
      "Strength",
      "Dexterity",
      "Charisma",
      "2",
      "Force Points",
      "Sanity",
    ]);
  });

  test("tell the books' six by their slug", () => {
    expect(["strength", "charisma", "forcepoints"].map((slug) => AbilityRules.isBookAbility(slug))).toEqual([
      true,
      true,
      false,
    ]);
  });
});
