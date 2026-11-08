import { describe, expect, test } from "bun:test";

import AbilityRules from "@/engine/rulesets/dnd3.5/rules/AbilityRules.ts";

describe("3.5's abilities", () => {
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

  test("are abbreviated by their slug's first three letters", () => {
    expect(["strength", "forcepoints", "kipoints"].map((slug) => AbilityRules.abbreviate(slug))).toEqual([
      "STR",
      "FOR",
      "KIP",
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
