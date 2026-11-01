import { describe, expect, test } from "bun:test";

import {
  answersSlots,
  canPlan,
  hasRoom,
  plannedPosition,
  plannedSlotKeys,
} from "@/client/src/pages/characters/details/components/levelUp/planSlots.ts";

/**
 * A track the character has two positions on, its last the fourth, which takes the third and fourth next; and one it
 * has none on, as their picker answers them
 */
const FIGHTER = { id: "fighter", track: { left: 2, positions: [3, 4] } };

/** A lone Fighter 3, a gap a forced level left: the engine numbers its next Fighter levels 1, 2, then 4 */
const GAP = { id: "fighter", track: { left: 3, positions: [1, 2, 4] } };

const WIZARD = { id: "wizard", track: { left: 2, positions: [1, 2] } };

describe("Add Level's plan", () => {
  test("numbers a track as its picker does, after the advancements of it planned before its place", () => {
    expect([0, 1, 2].map((before) => plannedPosition(GAP, [GAP, GAP, GAP], before))).toEqual([1, 2, 4]);
    const plan = [FIGHTER, null, WIZARD, FIGHTER];
    expect(plannedPosition(FIGHTER, plan, 0)).toBe(3);
    expect(plannedPosition(FIGHTER, plan, 3)).toBe(4);
    expect(plannedPosition(WIZARD, plan, 2)).toBe(1);
  });

  test("numbers the next one added at the plan's end, none past the track's last", () => {
    expect(plannedPosition(FIGHTER, [FIGHTER, WIZARD])).toBe(4);
    expect(plannedPosition(FIGHTER, [FIGHTER, WIZARD, FIGHTER])).toBeUndefined();
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

describe("a plan's answer", () => {
  const answered = [
    { position: 3, track: { id: "fighter" } },
    { position: 1, track: { id: "wizard" } },
  ];

  test("is for the planned advancements: as many, each on its slot's track at its position", () => {
    const slots = [
      { key: 0, position: 3, track: "fighter" },
      { key: 1, position: 1, track: "wizard" },
    ];
    expect(answersSlots(answered, slots)).toBe(true);
    // A slot removed, or another track planned, while the answer for the plan before loads
    expect(answersSlots(answered, slots.slice(1))).toBe(false);
    expect(answersSlots(answered, [slots[0], { track: "fighter" }])).toBe(false);
  });

  test("is for an edit's one advancement, whose slot names no track", () => {
    expect(answersSlots(answered.slice(0, 1), [{}])).toBe(true);
    expect(answersSlots(answered, [{}])).toBe(false);
  });
});
