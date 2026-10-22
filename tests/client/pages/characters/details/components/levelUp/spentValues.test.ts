import { describe, expect, test } from "bun:test";

import { pointsAt, valueAt } from "@/client/src/pages/characters/details/components/levelUp/spentValues.ts";

/** As a step answers a row unfavored at its first advancement, then favored: half a value, then one a point */
const row = { valuesByPoints: [0, 0.5, 1, 2, 3] };

describe("a spend row's value", () => {
  test("is its answer's at the points spent, or at the most it keeps", () => {
    expect([0, 1, 3, 4, 9].map((points) => valueAt(row, points))).toEqual([0, 0.5, 2, 3, 3]);
  });

  test("asks for the most points whose value doesn't pass the one typed", () => {
    expect([0, 0.5, 0.75, 2, 2.5, 10].map((value) => pointsAt(row, value))).toEqual([0, 1, 1, 3, 3, 4]);
  });
});
