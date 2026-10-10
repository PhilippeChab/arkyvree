import { describe, expect, test } from "bun:test";

import { PicksDistribution, type PoolSlots } from "@/engine/core/levelUp/index.ts";

/** Each spell's level in the wizard's list. */
const SPELL_LEVELS = new Map([
  ["missile:wizard", 1],
  ["shield:wizard", 1],
]);

/** Two planned levels: a General slot at the first, a first-level spell slot at the first. */
const TWO_LEVELS: PoolSlots = {
  perLevelFeatSlots: { general: [1, 0], bonus: [0, 0] },
  perLevelPowerSlots: { wizard: [{ 1: 1 }, {}] },
};

/** The base alone, as a ruleset without skill points would extend it: the levels its feat slots list. */
class PoolsOnly extends PicksDistribution<PoolSlots> {
  protected override distributeSkills() {}

  protected override get levelCount() {
    return Object.values(this.data.perLevelFeatSlots)[0]?.length ?? 0;
  }
}

describe("spreading a save's picks over its planned levels", () => {
  test("keeps picks past a pool's slots: a feat's and a spell's go on the last level", () => {
    const levels = new PoolsOnly(TWO_LEVELS).distribute(
      { skills: {}, feats: { general: ["dodge", "toughness"] }, powers: { wizard: ["missile", "shield"] } },
      SPELL_LEVELS,
      new Map(),
    );
    expect(levels.map(({ feats, powers }) => ({ feats, powers }))).toEqual([
      { feats: { general: ["dodge"] }, powers: { wizard: ["missile"] } },
      { feats: { general: ["toughness"] }, powers: { wizard: ["shield"] } },
    ]);
  });

  test("puts a pool's feats past its slots on the level of the feat that gives it room", () => {
    const levels = new PoolsOnly(TWO_LEVELS).distribute(
      { skills: {}, feats: { general: ["specialist"], bonus: ["school"] }, powers: {} },
      new Map(),
      new Map([["bonus", "specialist"]]),
    );
    expect(levels[0].feats).toEqual({ general: ["specialist"], bonus: ["school"] });
  });
});

describe("the planned level a pool's next pick goes on", () => {
  test("is the first whose slots so far outnumber the picks, the last once they're all taken", () => {
    expect(PicksDistribution.nextLevelOf([0, 2, 1], 0)).toBe(1);
    expect(PicksDistribution.nextLevelOf([0, 2, 1], 1)).toBe(1);
    expect(PicksDistribution.nextLevelOf([0, 2, 1], 2)).toBe(2);
    expect(PicksDistribution.nextLevelOf([0, 2, 1], 3)).toBe(2);
    expect(PicksDistribution.nextLevelOf([], 0)).toBe(0);
  });
});

describe("refusing picks that overfill their pools", () => {
  test("names each overfull pool, its picks and its room, and passes picks that fit", () => {
    expect(() =>
      PicksDistribution.refuseOverfull([
        { name: "General", picked: 3, room: 2 },
        { name: "Wizard Spells", picked: 1, room: 0 },
      ]),
    ).toThrow("General: 3 picked, room for 2; Wizard Spells: 1 picked, room for 0");
    expect(() => PicksDistribution.refuseOverfull([])).not.toThrow();
  });
});
