import { describe, expect, test } from "bun:test";

import PicksDistribution, {
  type PerLevelDistributionData,
} from "@/engine/rulesets/dnd3.5/levelUp/PicksDistribution.ts";

/** Each spell's level in the wizard's list. */
const SPELL_LEVELS = new Map([
  ["missile:wizard", 1],
  ["shield:wizard", 1],
]);

/** Two planned levels: a General slot at the first, a first-level spell slot at the first, no skill points. */
const TWO_LEVELS: PerLevelDistributionData = {
  perLevelClassSkillIds: [[], []],
  perLevelFeatSlots: { general: [1, 0], bonus: [0, 0] },
  perLevelPowerSlots: { wizard: [{ 1: 1 }, {}] },
  perLevelSkillPoints: [0, 0],
  savedLevelCount: 0,
  skillContexts: new Map(),
};

describe("spreading a save's picks over its planned levels", () => {
  test("keeps picks past a pool's slots: a feat's and a spell's go on the last level", () => {
    const distribution = new PicksDistribution(TWO_LEVELS);
    const levels = distribution.distribute(
      {},
      { general: ["dodge", "toughness"] },
      { wizard: ["missile", "shield"] },
      SPELL_LEVELS,
      new Map(),
    );
    expect(levels.map(({ feats, powers }) => ({ feats, powers }))).toEqual([
      { feats: { general: ["dodge"] }, powers: { wizard: ["missile"] } },
      { feats: { general: ["toughness"] }, powers: { wizard: ["shield"] } },
    ]);
  });

  test("puts a pool's feats past its slots on the level of the feat that gives it room", () => {
    const distribution = new PicksDistribution(TWO_LEVELS);
    const levels = distribution.distribute(
      {},
      { general: ["specialist"], bonus: ["school"] },
      {},
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
