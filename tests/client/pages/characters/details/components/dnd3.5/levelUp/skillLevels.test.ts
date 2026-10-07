import { describe, expect, test } from "bun:test";

import {
  editedLevelSkills,
  maxSkillPoints,
  skillRanks,
} from "@/client/src/pages/characters/details/components/dnd3.5/levelUp/skillLevels.ts";

/** A skill as its slots list it. */
function skill(id: string, isClassSkill: boolean, isCurrentClassSkill: boolean, currentRank = 0) {
  return { id, isClassSkill, isCurrentClassSkill, currentRank };
}

describe("a level wizard's skill levels", () => {
  test("are the edited level's class skills and points", () => {
    const skills = [skill("climb", true, true), skill("spot", true, false)];
    expect(editedLevelSkills({ skillPointsToSpend: 6, skills })).toEqual({ classSkillIds: [["climb"]], points: [6] });
  });

  // A class skill of the character's other class costs two points a rank at a level of a class without it
  test("buy ranks by the levels the points go to, not the character's class skills", () => {
    expect([
      skillRanks("spot", 4, { classSkillIds: [[]], points: [4] }),
      skillRanks("spot", 4, { classSkillIds: [["spot"]], points: [4] }),
      skillRanks("spot", 4, { classSkillIds: [["spot"], []], points: [2, 4] }),
    ]).toEqual([2, 4, 3]);
  });

  test("let a skill take the points up to its rank cap, less the ranks it has", () => {
    const levels = { classSkillIds: [["climb"]], points: [8] };
    // At level 2, a class skill's cap is 5 ranks, a cross-class one's 2.5
    expect(maxSkillPoints(skill("climb", true, true, 1), 2, levels)).toBe(4);
    expect(maxSkillPoints(skill("spot", false, false), 2, levels)).toBe(5);
  });
});
