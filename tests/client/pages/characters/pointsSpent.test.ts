import { describe, expect, test } from "bun:test";

import { formatPointsSpent, pointsSpent } from "@/client/src/pages/characters/pointsSpent.ts";

describe("points spent", () => {
  test("sum each pick's points, a list's or a map's", () => {
    expect(pointsSpent([2, 0, 5])).toBe(7);
    expect(pointsSpent({ climb: 2, swim: 3 })).toBe(5);
    expect(pointsSpent({})).toBe(0);
  });

  test("say what's spent of the total one way", () => {
    expect(formatPointsSpent(12, 25)).toBe("Points Spent: 12 / 25");
  });
});
