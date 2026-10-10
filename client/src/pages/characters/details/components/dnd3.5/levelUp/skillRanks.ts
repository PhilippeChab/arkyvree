/**
 * A skill's ranks as its skills step answers them (`ranksByPoints`: its ranks at each count of points from 0, up to the
 * most it keeps): what the Skills step and the review show the points spent come to, and the points its ranks field
 * asks for. The step answers them as the save spreads the points, so they're looked up here, never worked out.
 */

import type { SkillsData } from "./levelUpQueries.ts";

/** A skill's ranks by points, as a skills step answers them. */
type RankedSkill = Pick<SkillsData["skills"][number], "ranksByPoints">;

/** The most points whose ranks don't pass `ranks`: what a ranks field typed asks for. */
export function pointsAt(skill: RankedSkill, ranks: number) {
  const { ranksByPoints } = skill;
  for (let points = ranksByPoints.length - 1; points > 0; points--) if (ranksByPoints[points] <= ranks) return points;
  return 0;
}

/** The ranks `points` buy the skill: its answer's at that count, or at the most it keeps. */
export function ranksAt(skill: RankedSkill, points: number) {
  const { ranksByPoints } = skill;
  return ranksByPoints[Math.min(points, ranksByPoints.length - 1)] ?? 0;
}
