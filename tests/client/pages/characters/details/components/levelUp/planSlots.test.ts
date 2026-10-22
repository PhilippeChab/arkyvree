import { describe, expect, test } from "bun:test";

import {
  canPlan,
  hasRoom,
  plannedPosition,
  plannedSlotKeys,
} from "@/client/src/pages/characters/details/components/levelUp/planSlots.ts";

/** A track the character has two positions on, its next the third, and one it has none on */
const FIGHTER = { id: "fighter", track: { last: 4, left: 2, next: 3 } };

const WIZARD = { id: "wizard", track: { last: 20, left: 2, next: 1 } };

describe("Add Level's plan", () => {
  test("numbers a track after the advancements of it planned before its place", () => {
    const plan = [FIGHTER, null, WIZARD, FIGHTER];
    expect(plannedPosition(FIGHTER, plan, 0)).toBe(3);
    expect(plannedPosition(FIGHTER, plan, 3)).toBe(4);
    expect(plannedPosition(WIZARD, plan, 2)).toBe(1);
  });

  test("numbers the next one added at the plan's end", () => {
    expect(plannedPosition(FIGHTER, [FIGHTER, WIZARD, FIGHTER])).toBe(5);
    expect(plannedPosition(WIZARD, [])).toBe(1);
  });

  test("has room for another advancement while it holds fewer than the character has left, a slot not filled counted", () => {
    expect(hasRoom([FIGHTER], 2)).toBe(true);
    expect(hasRoom([FIGHTER, null], 2)).toBe(false);
    expect(hasRoom([], 0)).toBe(false);
    // Until the options load: the plan's answer refuses a plan past the character's last advancement
    expect(hasRoom([FIGHTER, WIZARD], undefined)).toBe(true);
  });

  test("plans a track's next position while it may, the plan has room, and the track has a position left", () => {
    const fighter = { ...FIGHTER, eligible: true };
    expect(canPlan(fighter, [], 2)).toBe(true);
    expect(canPlan(fighter, [FIGHTER], 2)).toBe(true);
    // Its fifth position is past its last
    expect(canPlan(fighter, [FIGHTER, FIGHTER], 3)).toBe(false);
    expect(canPlan(fighter, [WIZARD], 1)).toBe(false);
    expect(canPlan({ ...fighter, eligible: false }, [], 2)).toBe(false);
  });

  test("keys each planned advancement by its slot, so filling an earlier slot or removing one moves no value", () => {
    // A value set while its slot was the plan's only filled one
    const valueBySlot: Record<number, number | null> = { 7: 4 };
    const valuesOf = (plan: unknown[], slotKeys: number[]) =>
      plannedSlotKeys(plan, slotKeys).map((key) => valueBySlot[key] ?? null);
    expect(valuesOf([null, WIZARD], [3, 7])).toEqual([4]);
    expect(valuesOf([FIGHTER, WIZARD], [3, 7])).toEqual([null, 4]);
    expect(valuesOf([WIZARD], [7])).toEqual([4]);
    expect(plannedSlotKeys([], [])).toEqual([]);
  });
});
