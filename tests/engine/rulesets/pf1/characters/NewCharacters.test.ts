import { describe, expect, test } from "bun:test";

import NewCharacters from "@/engine/rulesets/pf1/characters/NewCharacters.ts";
import AbilityRules from "@/engine/rulesets/pf1/rules/AbilityRules.ts";

/** The point buy's costs, by score, as the Core Rulebook's table gives them. */
const CORE_RULEBOOK_COSTS = { 7: -4, 8: -2, 9: -1, 10: 0, 11: 1, 12: 2, 13: 3, 14: 5, 15: 7, 16: 10, 17: 13, 18: 17 };

/** A ruleset's view as a new character's form reads it: its abilities, as their rows came in. */
const DATA = {
  abilities: ["Charisma", "Wisdom", "Intelligence", "Constitution", "Dexterity", "Strength"].map((name) => ({
    id: `${name} id`,
    name,
  })),
};

/** The point buy a new character's form offers. */
function pointBuyOf() {
  const pointBuy = NewCharacters.describeCreation(DATA).methods.find((method) => method.kind === "pointBuy");
  if (pointBuy?.kind !== "pointBuy") throw new Error("No point buy");
  return pointBuy;
}

describe("A new Pathfinder character's creation", () => {
  test("lists the six abilities in the Core Rulebook's order", () => {
    expect(NewCharacters.describeCreation(DATA).entities.map(({ name }) => name)).toEqual([
      "Strength",
      "Dexterity",
      "Constitution",
      "Intelligence",
      "Wisdom",
      "Charisma",
    ]);
  });

  test("offers rolling and the point buy, and no standard array: the Core Rulebook gives none", () => {
    expect(NewCharacters.describeCreation(DATA).methods.map(({ id, kind }) => [id, kind])).toEqual([
      ["4d6-drop-lowest", "roll"],
      ["3d6-straight", "roll"],
      ["point-buy", "pointBuy"],
    ]);
  });

  test("buys scores from 7 to 18 out of a standard fantasy campaign's 15 points, a score below 10 refunding some", () => {
    const pointBuy = pointBuyOf();
    expect(pointBuy).toMatchObject({ budget: 15, min: 7, max: 18 });
    expect(pointBuy.costs).toEqual(CORE_RULEBOOK_COSTS);
  });

  test("gives each score the modifier (score − 10) / 2, rounded down", () => {
    const { modifiers } = NewCharacters.describeCreation(DATA);
    expect([1, 7, 8, 9, 10, 11, 12, 17, 18].map((score) => modifiers[score])).toEqual([-5, -2, -1, -1, 0, 0, 1, 3, 4]);
    for (const [score, modifier] of Object.entries(modifiers))
      expect(modifier).toBe(AbilityRules.computeModifier(Number(score)));
  });
});
