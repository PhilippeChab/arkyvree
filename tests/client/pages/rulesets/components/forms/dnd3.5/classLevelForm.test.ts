import { describe, expect, test } from "bun:test";

import { allLevelSaves, nextClassLevel } from "@/client/src/pages/rulesets/components/forms/dnd3.5/classLevelForm.ts";
import { EMPTY_CLASS_LEVEL } from "@/client/src/pages/rulesets/components/forms/dnd3.5/emptyForms.ts";

const FORTITUDE = { saveId: "fortitude", base: 2 };

describe("a class level's form", () => {
  // Its create dialog opens on the class's next level
  test("starts one above the class's highest level, from its base attack, skill points and saves", () => {
    const levels = [
      { level: 2, bab: 2, skills: 4, saves: [{ ...FORTITUDE, base: 3 }] },
      { level: 1, bab: 1, skills: 4, saves: [FORTITUDE] },
    ];
    expect(nextClassLevel(levels)).toEqual({
      level: 3,
      bab: 2,
      skills: 4,
      saves: [{ ...FORTITUDE, base: 3 }],
      feats: [],
    });
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
