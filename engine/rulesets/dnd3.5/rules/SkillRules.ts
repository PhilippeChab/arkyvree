/**
 * The 3.5 skill rules: the points a level gives, what a rank costs, and how many ranks a skill may hold. The client
 * keeps its own copy (`shared/dnd3.5/skills.ts`) until it reads them from the API.
 */
export default class SkillRules {
  /**
   * The skill points a level gives: its points per level (its class's and the skill point ability's modifier), at least
   * 1, and a bonus per level (a human's 1) beside the minimum, both four times over at the character's first level.
   */
  static levelPoints(pointsPerLevel: number, bonusPerLevel: number, isFirstCharacterLevel: boolean): number {
    return (Math.max(1, pointsPerLevel) + bonusPerLevel) * (isFirstCharacterLevel ? 4 : 1);
  }

  /** The most ranks a skill may have at `characterLevel`: the level + 3 as a class skill, half that cross-class. */
  static maxRank(characterLevel: number, isClassSkill: boolean): number {
    return isClassSkill ? characterLevel + 3 : (characterLevel + 3) / 2;
  }

  /** The points `ranks` cost: a point a rank in a class skill, two cross-class. */
  static pointsFor(ranks: number, isClassSkill: boolean): number {
    return isClassSkill ? ranks : ranks * 2;
  }

  /** The ranks `points` buy: a rank a point in a class skill, half a rank cross-class. */
  static ranksFor(points: number, isClassSkill: boolean): number {
    return isClassSkill ? points : points / 2;
  }
}
