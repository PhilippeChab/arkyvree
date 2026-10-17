import { describe, expect, test } from "bun:test";

import {
  copyProgression,
  countProgressionAt,
  countRegularAt,
  countRoomAt,
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
});
