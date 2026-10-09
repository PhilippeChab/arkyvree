/**
 * The levels a wizard spends skill points over: each one's class skills and points. The Add Level wizard plans several,
 * the Edit Level wizard edits one; its Skills step and its review read both the same way, as the server spends them.
 */

import { computeMaxPointsForSkill, computeMaxSkillRank, distributeSkillPoints } from "@/shared/dnd3.5/skills.ts";

import type { SkillsData } from "./levelUpQueries.ts";

/** The edited level's skill slots: its points, and whether its class has each skill. */
type LevelSlots = Pick<SkillsData, "skillPointsToSpend"> & {
  skills: Pick<SkillsData["skills"][number], "id" | "isCurrentClassSkill">[];
};

/** Each level's class skills and the points it gives, in level order. */
export interface SkillLevels {
  classSkillIds: string[][];
  points: number[];
}

/** A skill as its slots list it: its rank so far, and whether it's a class skill of any of the character's classes. */
export type SkillLimit = Pick<SkillsData["skills"][number], "currentRank" | "id" | "isClassSkill">;

/** The one level an edit spends its points on: the edited level's class skills and points. */
export function editedLevelSkills(skillData: LevelSlots): SkillLevels {
  return {
    classSkillIds: [skillData.skills.filter((skill) => skill.isCurrentClassSkill).map((skill) => skill.id)],
    points: [skillData.skillPointsToSpend],
  };
}

/** The most points a skill can still take over the levels: up to its rank cap, class-skill levels first. */
export function maxSkillPoints(skill: SkillLimit, totalCharacterLevel: number, levels: SkillLevels) {
  const ranksLeft = computeMaxSkillRank(totalCharacterLevel, skill.isClassSkill) - skill.currentRank;
  return computeMaxPointsForSkill(skill.id, ranksLeft, levels.classSkillIds, levels.points);
}

/** The ranks `points` buy a skill over the levels: a point a rank at a level it's a class skill of, two elsewhere. */
export function skillRanks(skillId: string, points: number, levels: SkillLevels) {
  return distributeSkillPoints(skillId, points, levels.classSkillIds, levels.points).ranks;
}
