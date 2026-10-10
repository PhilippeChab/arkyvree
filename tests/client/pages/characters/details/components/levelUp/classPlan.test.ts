import { describe, expect, test } from "bun:test";

import { plannedLevel, plannedSlotKeys } from "@/client/src/pages/characters/details/components/levelUp/classPlan.ts";

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

  test("keys each planned level by its slot, so filling an earlier slot or removing one moves no level's values", () => {
    // The wizard's hit points, set while its slot was the plan's only filled one
    const hpBySlot: Record<number, number | null> = { 7: 4 };
    const hpOf = (plan: unknown[], slotKeys: number[]) =>
      plannedSlotKeys(plan, slotKeys).map((key) => hpBySlot[key] ?? null);
    expect(hpOf([null, WIZARD], [3, 7])).toEqual([4]);
    expect(hpOf([FIGHTER, WIZARD], [3, 7])).toEqual([null, 4]);
    expect(hpOf([WIZARD], [7])).toEqual([4]);
    expect(plannedSlotKeys([], [])).toEqual([]);
  });
});
