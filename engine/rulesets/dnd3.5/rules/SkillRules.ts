import {
  CLASS_SKILL_POINTS_PER_RANK,
  CROSS_CLASS_POINTS_PER_RANK,
  CROSS_CLASS_RANK_CAP_DIVISOR,
  FIRST_LEVEL_SKILL_POINTS_MULTIPLIER,
  MAX_RANKS_OVER_LEVEL,
  MIN_SKILL_POINTS_PER_LEVEL,
} from "@/vocabulary/dnd3.5/skills.ts";

/**
 * The 3.5 skill rules: the points a level gives, what a rank costs, how many ranks a skill may hold, how points spread
 * over levels, and which skills are another's subtypes.
 */
export default class SkillRules {
  /**
   * The levels in the order points go to `skillId`: those where it's a class skill first, at a point a rank, then the
   * others, at two points a rank.
   */
  private static spendingOrder(skillId: string, perLevelClassSkillIds: string[][], perLevelSkillPoints: number[]) {
    const levels = perLevelSkillPoints.map((_, level) => ({
      level,
      pointsPerRank: perLevelClassSkillIds[level].includes(skillId)
        ? CLASS_SKILL_POINTS_PER_RANK
        : CROSS_CLASS_POINTS_PER_RANK,
    }));
    return [
      ...levels.filter((l) => l.pointsPerRank === CLASS_SKILL_POINTS_PER_RANK),
      ...levels.filter((l) => l.pointsPerRank === CROSS_CLASS_POINTS_PER_RANK),
    ];
  }

  /**
   * Whether the skill `name` is a subtype of one of `names`: a subtype names itself "<base> (<variant>)", and a
   * user-authored ruleset can nest them ("Knowledge (Arcana) (Ancient)"), so every " (" is a possible base's end.
   */
  static isSubtypeOf(name: string, names: Set<string>): boolean {
    for (let idx = name.indexOf(" ("); idx > 0; idx = name.indexOf(" (", idx + 1))
      if (names.has(name.slice(0, idx))) return true;

    return false;
  }

  /**
   * The skill points a level gives: its points per level (its class's and the skill point ability's modifier), at least
   * 1, and a bonus per level (a human's 1) beside the minimum, both four times over at the character's first level.
   */
  static levelPoints(pointsPerLevel: number, bonusPerLevel: number, isFirstCharacterLevel: boolean): number {
    const multiplier = isFirstCharacterLevel ? FIRST_LEVEL_SKILL_POINTS_MULTIPLIER : 1;
    return (Math.max(MIN_SKILL_POINTS_PER_LEVEL, pointsPerLevel) + bonusPerLevel) * multiplier;
  }

  /** The most ranks a skill may have at `characterLevel`: the level + 3 as a class skill, half that cross-class. */
  static maxRank(characterLevel: number, isClassSkill: boolean): number {
    const classSkillRanks = characterLevel + MAX_RANKS_OVER_LEVEL;
    return isClassSkill ? classSkillRanks : classSkillRanks / CROSS_CLASS_RANK_CAP_DIVISOR;
  }

  /** The points `ranks` cost: a point a rank in a class skill, two cross-class. */
  static pointsFor(ranks: number, isClassSkill: boolean): number {
    return ranks * (isClassSkill ? CLASS_SKILL_POINTS_PER_RANK : CROSS_CLASS_POINTS_PER_RANK);
  }

  /** The ranks `points` buy: a rank a point in a class skill, half a rank cross-class. */
  static ranksFor(points: number, isClassSkill: boolean): number {
    return points / (isClassSkill ? CLASS_SKILL_POINTS_PER_RANK : CROSS_CLASS_POINTS_PER_RANK);
  }

  /**
   * `points` spent on `skillId` over levels (each its class skills and the points it has), class-skill levels first:
   * the ranks they buy and the points each level spends.
   */
  static spend(
    skillId: string,
    points: number,
    perLevelClassSkillIds: string[][],
    perLevelSkillPoints: number[],
  ): { perLevel: number[]; ranks: number } {
    const perLevel = perLevelSkillPoints.map(() => 0);
    let ranks = 0;
    let remaining = points;
    for (const { level, pointsPerRank } of SkillRules.spendingOrder(
      skillId,
      perLevelClassSkillIds,
      perLevelSkillPoints,
    )) {
      if (remaining <= 0) break;
      const spent = Math.min(remaining, perLevelSkillPoints[level]);
      ranks += spent / pointsPerRank;
      perLevel[level] = spent;
      remaining -= spent;
    }
    return { ranks, perLevel };
  }
}
