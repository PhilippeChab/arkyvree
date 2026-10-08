import { describe, expect, test } from "bun:test";

import { plannedLevel } from "@/client/src/pages/characters/details/components/dnd3.5/levelUp/classPlan.ts";

const FIGHTER = { id: "fighter", nextLevel: 3 };

const WIZARD = { id: "wizard", nextLevel: 1 };

describe("Add Level's class plan", () => {
  test("numbers a class after the levels of it planned before its place", () => {
    const plan = [FIGHTER, null, WIZARD, FIGHTER];
    expect(plannedLevel(FIGHTER, plan, 0)).toBe(3);
    expect(plannedLevel(FIGHTER, plan, 3)).toBe(4);
    expect(plannedLevel(WIZARD, plan, 2)).toBe(1);
  });

  test("numbers the next one added at the plan's end", () => {
    expect(plannedLevel(FIGHTER, [FIGHTER, WIZARD, FIGHTER])).toBe(5);
    expect(plannedLevel(WIZARD, [])).toBe(1);
  });
});
