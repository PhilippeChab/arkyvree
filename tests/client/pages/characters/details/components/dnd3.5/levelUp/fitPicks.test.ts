import { describe, expect, test } from "bun:test";

import {
  fitFeats,
  fitPowers,
  fitSkillPoints,
  openPoolOf,
  withoutPick,
  withPick,
} from "@/client/src/pages/characters/details/components/dnd3.5/levelUp/fitPicks.ts";

/** A feat that grants `grants` slots in pool `poolId`. */
function feat(id: string, grants?: { poolId: string; slots: number }) {
  return {
    id,
    name: id,
    aptitudeModifiers: grants ? [{ aptitudeId: grants.poolId, value: grants.slots, operator: "add" }] : [],
  };
}

/** A feat pool with `available` slots. */
function featPool(id: string, available: number) {
  return { id, name: id, allowed: available, spent: 0, available, shared: false };
}

/** A spell picked at `powerLevel`. */
function power(id: string, powerLevel?: number) {
  return { id, name: id, powerLevel };
}

describe("fitting a level's feats to its pools", () => {
  test("keeps picks that fit, as the same object", () => {
    const feats = { general: [feat("Dodge")] };
    expect(fitFeats(feats, { general: featPool("general", 1) }).feats).toBe(feats);
  });

  test("drops the later picks a pool has no room for, and every pick of a pool gone", () => {
    const feats = { general: [feat("Dodge"), feat("Mobility")], fighter: [feat("Cleave")] };
    expect(fitFeats(feats, { general: featPool("general", 1) }).feats).toEqual({
      general: [feat("Dodge")],
      fighter: [],
    });
  });

  test("grows a pool by a picked feat's slots, and drops them with it", () => {
    const granter = feat("Bonus", { poolId: "bonus", slots: 1 });
    const feats = { general: [feat("Dodge"), granter], bonus: [feat("Cleave")] };
    const pools = { general: featPool("general", 2), bonus: featPool("bonus", 0) };
    const fitted = fitFeats(feats, pools);
    expect(fitted.feats).toBe(feats);
    expect(fitted.pools.bonus.available).toBe(1);
    // The granter no longer fits: its slot, and the feat in it, go
    expect(fitFeats(feats, { ...pools, general: featPool("general", 1) }).feats).toEqual({
      general: [feat("Dodge")],
      bonus: [],
    });
  });

  test("leaves the picks while the pools load", () => {
    const feats = { general: [feat("Dodge")] };
    expect(fitFeats(feats, undefined)).toEqual({ feats, pools: {} });
  });

  test("closes the picker of a pool with no slots", () => {
    const pools = { general: featPool("general", 1), bonus: featPool("bonus", 0) };
    expect([openPoolOf("general", pools), openPoolOf("bonus", pools), openPoolOf(null, pools)]).toEqual([
      "general",
      null,
      null,
    ]);
  });
});

describe("fitting a level's spells to its pools", () => {
  test("drops a leveled pool's latest picks at a spell level past its room", () => {
    const powers = { wizard: [power("a", 1), power("b", 1), power("c", 2)], gone: [power("d")] };
    const pools = {
      wizard: {
        id: "wizard",
        name: "Wizard",
        allowed: 3,
        spent: 0,
        available: 3,
        leveled: true,
        levels: { 1: { allowed: 1, spent: 0, available: 1 }, 2: { allowed: 1, spent: 0, available: 1 } },
      },
    };
    expect(fitPowers(powers, pools)).toEqual({ wizard: [power("a", 1), power("c", 2)], gone: [] });
  });

  test("keeps picks that fit, and every pick while the pools load", () => {
    const powers = { bard: [power("a")] };
    expect(fitPowers(powers, { bard: { id: "bard", name: "Bard", allowed: 1, spent: 0, available: 1 } })).toBe(powers);
    expect(fitPowers(powers, undefined)).toBe(powers);
  });

  test("adds a pick last in its pool, and removes one", () => {
    expect(withPick({ bard: [power("a")] }, "bard", power("b"))).toEqual({ bard: [power("a"), power("b")] });
    expect(withPick({}, "bard", power("a"))).toEqual({ bard: [power("a")] });
    expect(withoutPick({ bard: [power("a"), power("b")] }, "bard", "a")).toEqual({ bard: [power("b")] });
  });
});

describe("fitting a level's skill points", () => {
  // As the step answers them: Climb keeps up to 4 points, Swim 2 with Climb's spent
  const skills = [
    { id: "climb", ranksByPoints: [0, 1, 2, 3, 4] },
    { id: "swim", ranksByPoints: [0, 1, 2] },
  ];

  test("caps a skill at the most points its step answer keeps, in the order given", () => {
    expect(fitSkillPoints({ climb: 5, swim: 3 }, skills)).toEqual({ climb: 4, swim: 2 });
  });

  test("drops a skill the step doesn't list, and points that buy nothing", () => {
    expect(fitSkillPoints({ climb: 2, gone: 3, swim: 0 }, skills)).toEqual({ climb: 2 });
  });

  test("keeps points that fit, and every point while the step loads", () => {
    const allocations = { climb: 2 };
    expect(fitSkillPoints(allocations, skills)).toBe(allocations);
    expect(fitSkillPoints(allocations, undefined)).toBe(allocations);
  });
});
