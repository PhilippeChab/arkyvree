/**
 * Shared skill distribution algorithms used by both the frontend (UI previews)
 * and backend (actual distribution during batch level-up).
 */

/**
 * 2-pass greedy distribution: class-skill levels first (1 pt = 1 rank),
 * then cross-class levels (2 pts = 1 rank).
 */
export function distributeSkillPoints(
  skillId: string,
  points: number,
  perLevelClassSkillIds: string[][],
  perLevelSkillPoints: number[],
): { ranks: number; perLevel: number[] } {
  const perLevel = new Array(perLevelSkillPoints.length).fill(0);
  let ranks = 0;
  let remaining = points;

  // Pass 1: class-skill levels (1:1)
  for (let i = 0; i < perLevelSkillPoints.length && remaining > 0; i++) {
    if (!perLevelClassSkillIds[i].includes(skillId)) continue;
    const take = Math.min(remaining, perLevelSkillPoints[i]);
    ranks += take;
    perLevel[i] = take;
    remaining -= take;
  }

  // Pass 2: cross-class levels (2:1)
  for (let i = 0; i < perLevelSkillPoints.length && remaining > 0; i++) {
    if (perLevelClassSkillIds[i].includes(skillId)) continue;
    const take = Math.min(remaining, perLevelSkillPoints[i]);
    ranks += take / 2;
    perLevel[i] = take;
    remaining -= take;
  }

  return { ranks, perLevel };
}

/**
 * Compute max points that can be spent on a skill before hitting the rank cap.
 */
export function computeMaxPointsForSkill(
  skillId: string,
  maxRanksCanAdd: number,
  perLevelClassSkillIds: string[][],
  perLevelSkillPoints: number[],
): number {
  let ranksLeft = maxRanksCanAdd;
  let totalPoints = 0;

  // Pass 1: class-skill levels (1 pt = 1 rank)
  for (let i = 0; i < perLevelSkillPoints.length && ranksLeft > 0; i++) {
    if (!perLevelClassSkillIds[i].includes(skillId)) continue;
    const ranksFromLevel = Math.min(ranksLeft, perLevelSkillPoints[i]);
    totalPoints += ranksFromLevel;
    ranksLeft -= ranksFromLevel;
  }

  // Pass 2: cross-class levels (2 pts = 1 rank)
  for (let i = 0; i < perLevelSkillPoints.length && ranksLeft > 0; i++) {
    if (perLevelClassSkillIds[i].includes(skillId)) continue;
    const ranksFromLevel = Math.min(ranksLeft, perLevelSkillPoints[i] / 2);
    totalPoints += ranksFromLevel * 2;
    ranksLeft -= ranksFromLevel;
  }

  return Math.floor(totalPoints);
}
