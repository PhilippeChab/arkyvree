import { describe, expect, test } from "bun:test";

import CharacterEdits from "@/engine/rulesets/dnd3.5/characters/CharacterEdits.ts";
import AbilitiesComponent from "@/engine/rulesets/dnd3.5/model/abilities/AbilitiesComponent.ts";

describe("A new 3.5 character's creation", () => {
  test("offers the SRD's methods, each run by its kind", () => {
    const { methods } = CharacterEdits.describeCreation();
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
    const pointBuy = CharacterEdits.describeCreation().methods.find((method) => method.kind === "pointBuy");
    expect(pointBuy).toMatchObject({ budget: 25, max: 18, min: 8 });
    if (pointBuy?.kind !== "pointBuy") throw new Error("No point buy");
    const costs = Array.from({ length: 11 }, (_, index) => pointBuy.costs[8 + index]);
    expect(costs).toEqual([0, 1, 2, 3, 4, 5, 6, 8, 10, 13, 16]);
  });

  test("bounds its scores, starts an unset one at 10, and gives each score the abilities' modifier", () => {
    const { modifiers, scores } = CharacterEdits.describeCreation();
    expect(scores).toEqual({ max: 100, min: 1, start: 10 });
    expect(Object.keys(modifiers)).toHaveLength(100);
    expect([1, 8, 9, 10, 11, 12, 18, 19, 100].map((score) => modifiers[score])).toEqual([
      -5, -1, -1, 0, 0, 1, 4, 4, 45,
    ]);
    for (let score = scores.min; score <= scores.max; score++)
      expect(modifiers[score]).toBe(AbilitiesComponent.computeModifier(score));
  });
});
