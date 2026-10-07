/** Spending skill points over planned levels: the level-up wizard previews it, the server applies it. */

/**
 * The levels in the order points go to `skillId`: those where it's a class skill first, at a point a rank, then the
 * others, at two points a rank.
 */
function spendingOrder(
  skillId: string,
  perLevelClassSkillIds: string[][],
  perLevelSkillPoints: number[],
): { level: number; pointsPerRank: number }[] {
  const levels = perLevelSkillPoints.map((_, level) => ({
    level,
    pointsPerRank: perLevelClassSkillIds[level].includes(skillId) ? 1 : 2,
  }));
  return [...levels.filter((l) => l.pointsPerRank === 1), ...levels.filter((l) => l.pointsPerRank === 2)];
}

/**
 * The skill points a level gives: its points per level (its class's and the skill point ability's modifier), at least
 * 1, and a bonus per level (a human's 1) beside the minimum, both four times over at the character's first level.
 */
export function computeLevelSkillPoints(
  pointsPerLevel: number,
  bonusPerLevel: number,
  isFirstCharacterLevel: boolean,
): number {
  return (Math.max(1, pointsPerLevel) + bonusPerLevel) * (isFirstCharacterLevel ? 4 : 1);
}

/** The most points `skillId` can take before it gains `maxRanksCanAdd` ranks, class-skill levels first. */
export function computeMaxPointsForSkill(
  skillId: string,
  maxRanksCanAdd: number,
  perLevelClassSkillIds: string[][],
  perLevelSkillPoints: number[],
): number {
  let ranksLeft = maxRanksCanAdd;
  let points = 0;
  for (const { level, pointsPerRank } of spendingOrder(skillId, perLevelClassSkillIds, perLevelSkillPoints)) {
    if (ranksLeft <= 0) break;
    const ranks = Math.min(ranksLeft, perLevelSkillPoints[level] / pointsPerRank);
    points += ranks * pointsPerRank;
    ranksLeft -= ranks;
  }
  return Math.floor(points);
}

/** `points` spent on `skillId`, class-skill levels first: the ranks they buy and the points each level spends. */
export function distributeSkillPoints(
  skillId: string,
  points: number,
  perLevelClassSkillIds: string[][],
  perLevelSkillPoints: number[],
): { perLevel: number[]; ranks: number } {
  const perLevel = perLevelSkillPoints.map(() => 0);
  let ranks = 0;
  let remaining = points;
  for (const { level, pointsPerRank } of spendingOrder(skillId, perLevelClassSkillIds, perLevelSkillPoints)) {
    if (remaining <= 0) break;
    const spent = Math.min(remaining, perLevelSkillPoints[level]);
    ranks += spent / pointsPerRank;
    perLevel[level] = spent;
    remaining -= spent;
  }
  return { ranks, perLevel };
}
