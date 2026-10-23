import { describe, expect, test } from "bun:test";

import NewCharacters from "@/engine/rulesets/dnd3.5/characters/NewCharacters.ts";
import AbilityRules from "@/engine/rulesets/dnd3.5/rules/AbilityRules.ts";

/** A ruleset's view as a new character's form reads it: its abilities, as their rows came in. */
const VIEW = {
  rulesetData: {
    abilities: ["Sanity", "Wisdom", "Force Points", "Strength"].map((name) => ({ id: `${name} id`, name })),
  },
};

describe("A new 3.5 character's creation", () => {
  test("lists the ruleset's abilities in the order a sheet lists them: the books' first, then the others by name", () => {
    const { abilities } = NewCharacters.describeCreation(VIEW);
    expect(abilities).toEqual(
      ["Strength", "Wisdom", "Force Points", "Sanity"].map((name) => ({ id: `${name} id`, name })),
    );
  });

  test("offers the SRD's methods, each run by its kind", () => {
    const { methods } = NewCharacters.describeCreation(VIEW);
    expect(methods.map(({ id, kind }) => [id, kind])).toEqual([
      ["4d6-drop-lowest", "roll"],
      ["3d6-straight", "roll"],
      ["standard-array", "array"],
      ["point-buy", "pointBuy"],
    ]);
    expect(methods[0]).toMatchObject({ dice: { count: 4, keep: 3, sides: 6 } });
    expect(methods[2]).toMatchObject({ scores: [15, 14, 13, 12, 10, 8] });
  });

  test("buys a point buy's scores from 8 to 18 out of 25 points, each higher one costing more", () => {
    const pointBuy = NewCharacters.describeCreation(VIEW).methods.find((method) => method.kind === "pointBuy");
    expect(pointBuy).toMatchObject({ budget: 25, max: 18, min: 8 });
    if (pointBuy?.kind !== "pointBuy") throw new Error("No point buy");
    const costs = Array.from({ length: 11 }, (_, index) => pointBuy.costs[8 + index]);
    expect(costs).toEqual([0, 1, 2, 3, 4, 5, 6, 8, 10, 13, 16]);
  });

  test("bounds its scores, starts an unset one at 10, and gives each score the abilities' modifier", () => {
    const { modifiers, scores } = NewCharacters.describeCreation(VIEW);
    expect(scores).toEqual({ max: 100, min: 1, start: 10 });
    expect(Object.keys(modifiers)).toHaveLength(100);
    expect([1, 8, 9, 10, 11, 12, 18, 19, 100].map((score) => modifiers[score])).toEqual([
      -5, -1, -1, 0, 0, 1, 4, 4, 45,
    ]);
    for (let score = scores.min; score <= scores.max; score++)
      expect(modifiers[score]).toBe(AbilityRules.computeModifier(score));
  });

  test("writes a new character's fields into their columns, an empty or a missing optional one left out", () => {
    expect(
      NewCharacters.planFields({
        xp: 0,
        alignment: "Lawful Good",
        gender: "Female",
        age: null,
        height: "",
        weight: "60",
        deity: null,
        description: "Tall",
      }),
    ).toEqual({ columns: { alignment: "Lawful Good", gender: "Female", xp: 0, weight: "60", description: "Tall" } });
    expect(NewCharacters.planFields({ xp: 300, alignment: "True Neutral", gender: "Male", age: 30 })).toEqual({
      columns: { alignment: "True Neutral", gender: "Male", xp: 300, age: 30 },
    });
  });

  test("refuses a required field missing or unset, a value its field doesn't take, or a field its form hasn't", () => {
    const fields = { xp: 0, alignment: "Lawful Good", gender: "Female" };
    const { xp: _xp, ...withoutXp } = fields;
    for (const sent of [
      withoutXp,
      { ...fields, alignment: "" },
      { ...fields, gender: null },
      { ...fields, xp: -1 },
      { ...fields, age: 0 },
      { ...fields, alignment: "Lawful Awesome" },
      { ...fields, strength: 18 },
    ])
      expect(() => NewCharacters.planFields(sent)).toThrow(expect.objectContaining({ refusal: "invalid" }));
  });
});
