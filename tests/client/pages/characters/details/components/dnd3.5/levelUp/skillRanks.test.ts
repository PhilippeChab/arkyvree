import { describe, expect, test } from "bun:test";

import { pointsAt, ranksAt } from "@/client/src/pages/characters/details/components/dnd3.5/levelUp/skillRanks.ts";

/** As a step answers a skill cross-class at its first level, then a class skill: half a rank, then a rank a point */
const skill = { ranksByPoints: [0, 0.5, 1, 2, 3] };

describe("a skill's ranks", () => {
  test("are its answer's at the points spent, or at the most it keeps", () => {
    expect([0, 1, 3, 4, 9].map((points) => ranksAt(skill, points))).toEqual([0, 0.5, 2, 3, 3]);
  });

  test("ask for the most points whose ranks don't pass those typed", () => {
    expect([0, 0.5, 0.75, 2, 2.5, 10].map((ranks) => pointsAt(skill, ranks))).toEqual([0, 1, 1, 3, 3, 4]);
  });
});
