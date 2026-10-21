import { describe, expect, test } from "bun:test";

import {
  allLevelSaves,
  EMPTY_CLASS_LEVEL,
  nextClassLevel,
  sortLevelFeats,
} from "@/client/src/pages/rulesets/components/forms/classLevelForm.ts";

const FORTITUDE = { saveId: "fortitude", base: 2 };

describe("a class level's form", () => {
  // Its create dialog opens on the class's next level
  test("starts one above the class's highest level, from its saves (its fields from its own: `withEntityFields`)", () => {
    const levels = [
      { level: 2, bab: 2, skills: 4, saves: [{ ...FORTITUDE, base: 3 }] },
      { level: 1, bab: 1, skills: 4, saves: [FORTITUDE] },
    ];
    expect(nextClassLevel(levels)).toEqual({ level: 3, saves: [{ ...FORTITUDE, base: 3 }], feats: [] });
  });

  test("starts from the first level's empty form for a class without one, or while its levels load", () => {
    expect([nextClassLevel([]), nextClassLevel(undefined)]).toEqual([EMPTY_CLASS_LEVEL, EMPTY_CLASS_LEVEL]);
  });

  test("sends every ruleset save, 0 when unset, and its own until they load", () => {
    const saves = [FORTITUDE];
    expect(allLevelSaves([{ id: "fortitude" }, { id: "will" }], saves)).toEqual([
      FORTITUDE,
      { saveId: "will", base: 0 },
    ]);
    expect(allLevelSaves(undefined, saves)).toBe(saves);
  });
});

describe("a level's granted feats", () => {
  test("are kept in their labels' order, whatever order they came in", () => {
    const feats = [{ label: "Toughness (General)" }, { label: "Alertness (General)" }, { label: "Dodge (Fighter)" }];
    expect(sortLevelFeats(feats, (feat) => feat.label).map((feat) => feat.label)).toEqual([
      "Alertness (General)",
      "Dodge (Fighter)",
      "Toughness (General)",
    ]);
    expect(feats[0].label).toBe("Toughness (General)");
  });
});
