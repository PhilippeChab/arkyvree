import { describe, expect, test } from "bun:test";

import SkillSpending from "@/engine/rulesets/dnd3.5/levelUp/SkillSpending.ts";

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
  { id: "climb", currentRank: 0, isClassSkill: true, isCurrentClassSkill: true },
  { id: "hide", currentRank: 0, isClassSkill: true, isCurrentClassSkill: false },
];

/** Each skill's spending of `points`, by its id. */
function spend(points: Record<string, number>) {
  return Object.fromEntries(new SkillSpending(LEVELS, SKILLS).describe(points, 8).map((skill) => [skill.id, skill]));
}

describe("spending a level-up's skill points", () => {
  test("spreads them in the form's order, class-skill levels first, as the save does", () => {
    // Climb spends the first level's points: Hide is left the second's, cross-class there
    expect(spend({ climb: 4, hide: 4 }).hide).toMatchObject({
      points: 4,
      ranks: 2,
      ranksByPoints: [0, 0.5, 1, 1.5, 2],
    });
    // Hide first takes the first level's, a rank a point, and Climb the second's
    const hideFirst = spend({ hide: 4, climb: 4 });
    expect([hideFirst.hide.ranks, hideFirst.climb.ranks]).toEqual([4, 4]);
  });

  test("answers what a skill takes alone, a rank step, and its class mark across classes", () => {
    const { climb, hide } = spend({});
    // Alone, Hide takes the first level's 4 points and the second's
    expect([hide.maxPoints, hide.rankStep, hide.classSkill]).toEqual([8, 1, true]);
    expect(climb.ranksByPoints).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
  });
});
