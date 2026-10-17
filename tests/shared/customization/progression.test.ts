import { describe, expect, test } from "bun:test";

import {
  copyProgression,
  countProgressionAt,
  countRegularAt,
  countRoomAt,
  findProgressionIssues,
} from "@/shared/customization/progression.ts";

describe("A progression", () => {
  test("gives one at each multiple of its frequency, none at 0, and its own more at the levels it names", () => {
    expect([1, 3, 4, 6].map((level) => countRegularAt(3, level))).toEqual([0, 1, 0, 1]);
    expect([countRegularAt(0, 6), countRegularAt(3, 0), countRegularAt(3, -3)]).toEqual([0, 0, 0]);
    // What a level may give more within its bound: none where the frequency fills it
    expect([countRoomAt(4, 8, 1), countRoomAt(4, 6, 1), countRoomAt(3, 6, 10)]).toEqual([0, 1, 9]);
    const feats = { every: 3, extra: [{ amount: 2, level: 3 }] };
    expect([1, 3, 6].map((level) => countProgressionAt(feats, level))).toEqual([0, 3, 1]);
  });

  test("is copied apart from what it's copied from", () => {
    const original = { every: 3, extra: [{ amount: 1, level: 1 }] };
    const copy = copyProgression(original);
    copy.extra[0].amount = 2;
    expect(original.extra[0].amount).toBe(1);
  });

  test("finds a level listed twice, both of them, and one giving past its bound, by the part to change", () => {
    const given = (...extra: [number, number][]) => extra.map(([level, amount]) => ({ amount, level }));
    expect(findProgressionIssues({ every: 3, extra: given([2, 1], [5, 9]) }, 10)).toEqual([]);
    expect(findProgressionIssues({ every: 3, extra: given([2, 1], [2, 1], [6, 10]) }, 10)).toEqual([
      { index: 0, message: "Level 2 is listed twice", part: "level" },
      { index: 1, message: "Level 2 is listed twice", part: "level" },
      { index: 2, message: "Level 6 would give 11, at most 10", part: "amount" },
    ]);
    // One at most a level: its level is what's wrong
    expect(findProgressionIssues({ every: 1, extra: given([3, 1]) }, 1)).toEqual([
      { index: 0, message: "Level 3 gives one already, every level", part: "level" },
    ]);
  });
});
