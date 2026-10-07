import { describe, expect, test } from "bun:test";

import {
  computeLevelSkillPoints,
  computeMaxPointsForSkill,
  computeMaxSkillRank,
  distributeSkillPoints,
} from "@/shared/dnd3.5/skills.ts";

const CLIMB = "climb";
/** Levels by whether Climb is a class skill at them, with the skill points each gives. */
function levels(...entries: [classSkill: boolean, points: number][]) {
  return {
    classSkills: entries.map(([classSkill]) => (classSkill ? [CLIMB] : [])),
    points: entries.map(([, points]) => points),
  };
}

// A class skill takes a point a rank, a cross-class one two: class-skill levels are spent first.
describe("skill points", () => {
  test.each([
    ["the rank cap, at class-skill levels", levels([true, 4]), 4, 4],
    ["two points a rank at cross-class levels", levels([false, 8]), 2, 4],
    ["class-skill levels first, then cross-class ones", levels([true, 3], [false, 8]), 5, 7],
    ["all the points left when the cap is out of reach", levels([true, 2], [false, 3]), 10, 5],
  ])("spend at most %s", (_, { classSkills, points }, maxRanks, expected) => {
    expect(computeMaxPointsForSkill(CLIMB, maxRanks, classSkills, points)).toBe(expected);
  });

  test("distributed, reach the rank cap with the most points it allows", () => {
    const { classSkills, points } = levels([true, 3], [false, 8]);
    const most = computeMaxPointsForSkill(CLIMB, 5, classSkills, points);
    expect(distributeSkillPoints(CLIMB, most, classSkills, points)).toEqual({ ranks: 5, perLevel: [3, 4] });
  });
});

describe("a skill's rank cap", () => {
  test("is the character's level + 3 for a class skill, half that for a cross-class one", () => {
    expect([computeMaxSkillRank(1, true), computeMaxSkillRank(1, false), computeMaxSkillRank(4, false)]).toEqual([
      4, 2, 3.5,
    ]);
  });
});

describe("a level's skill points", () => {
  test("are at least 1 with a bonus beside, then four times over at the character's first level", () => {
    expect([
      computeLevelSkillPoints(3, 0, false),
      computeLevelSkillPoints(3, 0, true),
      computeLevelSkillPoints(-1, 0, false),
      computeLevelSkillPoints(-1, 0, true),
    ]).toEqual([3, 12, 1, 4]);
    // A human's 1 a level comes beside the minimum: 4 more at the first level, not multiplied in with a penalty.
    expect([computeLevelSkillPoints(-2, 1, false), computeLevelSkillPoints(-2, 1, true)]).toEqual([2, 8]);
  });
});
