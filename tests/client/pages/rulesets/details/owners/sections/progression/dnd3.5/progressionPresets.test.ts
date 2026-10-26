import { describe, expect, test } from "bun:test";

import {
  detectPreset,
  findNearestPreset,
  formatTrackValue,
  presetsOf,
} from "@/client/src/pages/rulesets/details/owners/sections/progression/progressionPresets.ts";
import { PROGRESSION } from "@/engine/rulesets/dnd3.5/entities/classes/progression.ts";

/** 3.5's base attack bonus and saves tracks. */
const [BAB, SAVES] = PROGRESSION.tracks;

/** A track's values at levels 1 to `count`, each `valueAt`'s. */
function track(count: number, valueAt: (level: number) => number) {
  return Array.from({ length: count }, (_, index) => ({ level: index + 1, value: valueAt(index + 1) }));
}

describe("A class's progression presets", () => {
  test("follow the SRD's base attack bonus and save tables", () => {
    const at = (presets: ReturnType<typeof presetsOf>, key: string, level: number) =>
      presets.find((preset) => preset.key === key)!.valueAt(level);
    const [bab, saves] = [presetsOf(BAB), presetsOf(SAVES)];
    expect([1, 4, 20].map((level) => at(bab, "good", level))).toEqual([1, 4, 20]);
    expect([1, 4, 20].map((level) => at(bab, "medium", level))).toEqual([0, 3, 15]);
    expect([1, 4, 20].map((level) => at(bab, "poor", level))).toEqual([0, 2, 10]);
    expect([1, 2, 20].map((level) => at(saves, "good", level))).toEqual([2, 3, 12]);
    expect([1, 3, 20].map((level) => at(saves, "poor", level))).toEqual([0, 1, 6]);
  });

  test("detect the one a track follows at every level, and the nearest one when none does", () => {
    const monk = track(20, (level) => Math.floor((level * 3) / 4));
    expect(detectPreset(presetsOf(BAB), monk)?.key).toBe("medium");
    // A prestige class's ten levels follow it too
    expect(
      detectPreset(
        presetsOf(SAVES),
        track(10, (level) => 2 + Math.floor(level / 2)),
      )?.key,
    ).toBe("good");

    const odd = monk.map((value) => (value.level === 10 ? { ...value, value: 10 } : value));
    expect(detectPreset(presetsOf(BAB), odd)).toBeUndefined();
    expect(findNearestPreset(presetsOf(BAB), odd).key).toBe("medium");
    expect(detectPreset(presetsOf(BAB), [])).toBeUndefined();
  });

  test("write a value as its rules label it, and as it is past its labels", () => {
    expect([0, 5, 6, 11, 20].map((bab) => formatTrackValue(BAB, bab))).toEqual([
      "+0",
      "+5",
      "+6/+1",
      "+11/+6/+1",
      "+20/+15/+10/+5",
    ]);
    expect([0, 4].map((base) => formatTrackValue(SAVES, base))).toEqual(["+0", "+4"]);
    expect(formatTrackValue(BAB, 21)).toBe("21");
    expect(formatTrackValue(PROGRESSION.tracks[2], 6)).toBe("6");
  });
});
