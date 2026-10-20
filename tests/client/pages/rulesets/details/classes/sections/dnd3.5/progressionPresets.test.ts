import { describe, expect, test } from "bun:test";

import {
  BAB_PRESETS,
  detectPreset,
  findNearestPreset,
  formatBab,
  SAVE_PRESETS,
} from "@/client/src/pages/rulesets/details/classes/sections/dnd3.5/progressionPresets.ts";

/** A track's values at levels 1 to `count`, each `valueAt`'s. */
function track(count: number, valueAt: (level: number) => number) {
  return Array.from({ length: count }, (_, index) => ({ level: index + 1, value: valueAt(index + 1) }));
}

describe("A class's progression presets", () => {
  test("follow the SRD's base attack bonus and save tables", () => {
    const at = (presets: typeof BAB_PRESETS, key: string, level: number) =>
      presets.find((preset) => preset.key === key)!.valueAt(level);
    expect([1, 4, 20].map((level) => at(BAB_PRESETS, "good", level))).toEqual([1, 4, 20]);
    expect([1, 4, 20].map((level) => at(BAB_PRESETS, "medium", level))).toEqual([0, 3, 15]);
    expect([1, 4, 20].map((level) => at(BAB_PRESETS, "poor", level))).toEqual([0, 2, 10]);
    expect([1, 2, 20].map((level) => at(SAVE_PRESETS, "good", level))).toEqual([2, 3, 12]);
    expect([1, 3, 20].map((level) => at(SAVE_PRESETS, "poor", level))).toEqual([0, 1, 6]);
  });

  test("detect the one a track follows at every level, and the nearest one when none does", () => {
    const monk = track(20, (level) => Math.floor((level * 3) / 4));
    expect(detectPreset(BAB_PRESETS, monk)?.key).toBe("medium");
    // A prestige class's ten levels follow it too
    expect(
      detectPreset(
        SAVE_PRESETS,
        track(10, (level) => 2 + Math.floor(level / 2)),
      )?.key,
    ).toBe("good");

    const odd = monk.map((value) => (value.level === 10 ? { ...value, value: 10 } : value));
    expect(detectPreset(BAB_PRESETS, odd)).toBeUndefined();
    expect(findNearestPreset(BAB_PRESETS, odd).key).toBe("medium");
    expect(detectPreset(BAB_PRESETS, [])).toBeUndefined();
  });

  test("write a base attack bonus with its attacks a round, as the sheet does", () => {
    expect([0, 5, 6, 11, 20, 21].map(formatBab)).toEqual([
      "+0",
      "+5",
      "+6/+1",
      "+11/+6/+1",
      "+20/+15/+10/+5",
      "+21/+16/+11/+6/+1",
    ]);
  });
});
