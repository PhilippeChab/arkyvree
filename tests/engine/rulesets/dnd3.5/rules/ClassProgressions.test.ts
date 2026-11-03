import { describe, expect, test } from "bun:test";

import ClassProgressions from "@/engine/rulesets/dnd3.5/rules/ClassProgressions.ts";
import { MAX_CLASS_LEVEL } from "@/vocabulary/dnd3.5/classes.ts";

describe("a class's progressions", () => {
  test("give its base attack bonus by level: the level, three quarters of it, or half", () => {
    expect([1, 4, 20].map((level) => ClassProgressions.babAt("good", level))).toEqual([1, 4, 20]);
    expect([1, 4, 20].map((level) => ClassProgressions.babAt("medium", level))).toEqual([0, 3, 15]);
    expect([1, 4, 20].map((level) => ClassProgressions.babAt("poor", level))).toEqual([0, 2, 10]);
  });

  test("give its base saves by level: 2 and half of it, or a third", () => {
    expect([1, 2, 20].map((level) => ClassProgressions.saveAt("good", level))).toEqual([2, 3, 12]);
    expect([1, 3, 20].map((level) => ClassProgressions.saveAt("poor", level))).toEqual([0, 1, 6]);
  });

  test("give each one's value at every class level, the best first", () => {
    const { bab, saves } = ClassProgressions.describePresets();
    const levels = Array.from({ length: MAX_CLASS_LEVEL }, (_, index) => index + 1);
    expect(Object.keys(bab)).toEqual(["good", "medium", "poor"]);
    expect(Object.keys(saves)).toEqual(["good", "poor"]);
    expect(bab.medium).toEqual(levels.map((level) => ClassProgressions.babAt("medium", level)));
    expect(saves.good).toEqual(levels.map((level) => ClassProgressions.saveAt("good", level)));
  });
});
