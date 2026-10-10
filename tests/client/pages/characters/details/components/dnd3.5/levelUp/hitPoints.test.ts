import { describe, expect, test } from "bun:test";

import { hpError, hpSet } from "@/client/src/pages/characters/details/components/dnd3.5/levelUp/hitPoints.ts";

/** As the rules answer a level's hit points: 1 to its die */
const FIGHTER = { className: "Fighter", hd: 10, hitPoints: { average: 5, max: 10, min: 1 }, nextLevel: 2 };

const WIZARD = { className: "Wizard", hd: 4, hitPoints: { average: 2, max: 4, min: 1 }, nextLevel: 1 };

describe("a level wizard's hit points", () => {
  test("take a whole number within the bounds the level's rules answer", () => {
    expect([hpError(1, WIZARD), hpError(4, WIZARD)]).toEqual([undefined, undefined]);
    expect([hpError(0, WIZARD), hpError(5, WIZARD), hpError(2.5, WIZARD)]).toEqual([
      "Minimum 1",
      "Maximum 4",
      "Whole numbers only",
    ]);
  });

  test("are set once every level has its own, each one right", () => {
    expect(hpSet([FIGHTER, WIZARD], [10, 3])).toBe(true);
    expect(hpSet([FIGHTER, WIZARD], [10, null])).toBe(false);
    expect(hpSet([FIGHTER, WIZARD], [10, 5])).toBe(false);
    // Edit Level's class is still loading
    expect(hpSet([], [])).toBe(false);
  });
});
