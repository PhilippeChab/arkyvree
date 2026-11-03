import { describe, expect, test } from "bun:test";

import PicksDistribution, { type PoolSlots } from "@/engine/rulesets/dnd3.5/levelUp/PicksDistribution.ts";

/**
 * Two levels of a character past its tenth, its rank caps out of reach: the first a class's with Climb and Hide, the
 * second a class's with Climb alone, 4 points each.
 */
const LEVELS = {
  perLevelClassSkillIds: [["climb", "hide"], ["climb"]],
  perLevelSkillPoints: [4, 4],
  savedLevelCount: 10,
};

const SKILLS = [
  { id: "climb", currentRank: 0, isClassSkill: true },
  { id: "hide", currentRank: 0, isClassSkill: true },
];

/** Each spell's level in the wizard's list. */
const SPELL_LEVELS = new Map([
  ["missile:wizard", 1],
  ["shield:wizard", 1],
]);

/** Two planned levels: a General slot at the first, a first-level spell slot at the first. */
const TWO_LEVELS: PoolSlots = {
  perLevelFeatSlots: { general: [1, 0], bonus: [0, 0] },
  perLevelSpellSlots: { wizard: [{ 1: 1 }, {}] },
};

/** The distribution of `levels`' skill points, no pool slots. */
function distributionOf(levels: typeof LEVELS) {
  return new PicksDistribution({
    ...levels,
    perLevelFeatSlots: {},
    perLevelSpellSlots: {},
    skillContexts: PicksDistribution.contextsOf(SKILLS),
  });
}

/** The distribution of two planned levels' pool slots (`slots`), no skill points. */
function poolsOnly(slots: PoolSlots) {
  return new PicksDistribution({
    ...slots,
    perLevelClassSkillIds: [[], []],
    perLevelSkillPoints: [0, 0],
    savedLevelCount: 0,
    skillContexts: new Map(),
  });
}

describe("spreading a save's skill points over its planned levels", () => {
  test("spreads them in the form's order, class-skill levels first", () => {
    const distribution = distributionOf(LEVELS);
    // Climb spends the first level's points: Hide is left the second's, cross-class there
    const levels = distribution.distribute(
      { skills: { climb: 4, hide: 4 }, feats: {}, spells: {} },
      new Map(),
      new Map(),
    );
    expect(levels.map(({ skills }) => skills)).toEqual([{ climb: 4 }, { hide: 4 }]);
    expect(distribution.spendSkillPoints({ climb: 4, hide: 4 }).get("hide")).toEqual({ points: 4, ranks: 2 });
    // Hide first takes the first level's, a rank a point, and Climb the second's
    const hideFirst = distribution.spendSkillPoints({ hide: 4, climb: 4 });
    expect([hideFirst.get("hide")!.ranks, hideFirst.get("climb")!.ranks]).toEqual([4, 4]);
  });

  test("caps a skill's points at its rank cap at each level, moving what's over to the next", () => {
    // A new character's first two levels, 8 points each: Climb caps at 4 ranks at the first, 5 at the second
    const distribution = distributionOf({
      perLevelClassSkillIds: [["climb"], ["climb"]],
      perLevelSkillPoints: [8, 8],
      savedLevelCount: 0,
    });
    const levels = distribution.distribute({ skills: { climb: 8 }, feats: {}, spells: {} }, new Map(), new Map());
    expect(levels.map(({ skills }) => skills)).toEqual([{ climb: 4 }, { climb: 1 }]);
    expect(distribution.spendSkillPoints({ climb: 8 }).get("climb")).toEqual({ points: 5, ranks: 5 });
  });
});

describe("spreading a save's picks over its planned levels", () => {
  test("keeps picks past a pool's slots: a feat's and a spell's go on the last level", () => {
    const levels = poolsOnly(TWO_LEVELS).distribute(
      { skills: {}, feats: { general: ["dodge", "toughness"] }, spells: { wizard: ["missile", "shield"] } },
      SPELL_LEVELS,
      new Map(),
    );
    expect(levels.map(({ feats, spells }) => ({ feats, spells }))).toEqual([
      { feats: { general: ["dodge"] }, spells: { wizard: ["missile"] } },
      { feats: { general: ["toughness"] }, spells: { wizard: ["shield"] } },
    ]);
  });

  test("puts a pool's feats past its slots on the level of the feat that gives it room", () => {
    const levels = poolsOnly(TWO_LEVELS).distribute(
      { skills: {}, feats: { general: ["specialist"], bonus: ["school"] }, spells: {} },
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
