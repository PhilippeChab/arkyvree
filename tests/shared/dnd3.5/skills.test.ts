import { describe, expect, test } from "bun:test";

import { computeMaxPointsForSkill, distributeSkillPoints } from "@/shared/dnd3.5/skills.ts";

const CLIMB = "climb";
/** Levels by whether Climb is a class skill at them, with the skill points each gives. */
const levels = (...entries: [classSkill: boolean, points: number][]) => ({
  classSkills: entries.map(([classSkill]) => (classSkill ? [CLIMB] : [])),
  points: entries.map(([, points]) => points),
});

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
