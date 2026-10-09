import { describe, expect, test } from "bun:test";

import { getRollFunction, POINT_BUY_COSTS, pointBuySpent, rollDie } from "@/client/src/pages/characters/dice.ts";

describe("Dice", () => {
  test("roll between one and their sides, and ability methods between 3 and 18", () => {
    for (let i = 0; i < 200; i++) {
      expect(rollDie(6)).toBeWithin(1, 7);
      expect(getRollFunction("4d6-drop-lowest")!()).toBeWithin(3, 19);
      expect(getRollFunction("3d6-straight")!()).toBeWithin(3, 19);
    }
    expect([getRollFunction("standard-array"), getRollFunction("point-buy")]).toEqual([null, null]);
  });

  test("cost more points for each higher score", () => {
    const scores = Object.keys(POINT_BUY_COSTS)
      .map(Number)
      .sort((a, b) => a - b);
    for (const [i, score] of scores.slice(1).entries())
      expect(POINT_BUY_COSTS[score]).toBeGreaterThan(POINT_BUY_COSTS[scores[i]]);
  });

  test("spend a point-buy's points by each score's cost", () => {
    expect(pointBuySpent([8, 10, 15])).toBe(0 + 2 + 8);
    expect(pointBuySpent([])).toBe(0);
  });
});
