import { CLASS_SKILL_BONUS, MAX_RANKS_OVER_HIT_DICE, MIN_SKILL_RANKS_PER_LEVEL } from "@/vocabulary/dnd5.2/skills.ts";

/** The points a rank costs: one, a class skill's or not. */
const POINTS_PER_RANK = 1;

/**
 * Pathfinder's skill rules: the ranks a level gives, what a rank costs (a point, a class skill's or not), how many
 * ranks a skill may hold (as many as the character's hit dice), how ranks spread over levels, the bonus a class skill
 * with a rank takes, and which skills are another's subtypes.
 */
export default class SkillRules {
  /** The bonus a skill takes for being a class skill of the character's (`isClassSkill`) with a rank (`ranks`): +3. */
  static classSkillBonus(ranks: number, isClassSkill: boolean): number {
    return isClassSkill && ranks >= 1 ? CLASS_SKILL_BONUS : 0;
  }

  /**
   * A class's class skills among the ruleset's skills (`skills`): those its class skill links name (`linkedIds`), and
   * their subtypes ("Craft (Armorsmithing)" of Craft), in the ruleset's order, whatever the links' order.
   */
  static classSkillIds(linkedIds: Iterable<string>, skills: readonly { id: string; name: string }[]): Set<string> {
    const linked = new Set(linkedIds);
    // A class with no class skill links (the ruleset's others, which the character has no level of) has none
    if (linked.size === 0) return new Set<string>();
    const names = new Set(skills.filter((skill) => linked.has(skill.id)).map((skill) => skill.name));
    return new Set(
      skills.filter((skill) => linked.has(skill.id) || SkillRules.isSubtypeOf(skill.name, names)).map(({ id }) => id),
    );
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
   * The skill ranks a level gives: its ranks per level (its class's and the skill rank ability's modifier), at least
   * none, and a bonus per level (a human's 1, a favored class's) beside it. A character's first level gives no more.
   */
  static levelPoints(pointsPerLevel: number, bonusPerLevel: number): number {
    return Math.max(MIN_SKILL_RANKS_PER_LEVEL, pointsPerLevel) + bonusPerLevel;
  }

  /** The most ranks a skill may have at `characterLevel`: its hit dice, a class skill's or not. */
  static maxRank(characterLevel: number): number {
    return characterLevel + MAX_RANKS_OVER_HIT_DICE;
  }

  /** The points `ranks` cost: a point a rank. */
  static pointsFor(ranks: number): number {
    return ranks * POINTS_PER_RANK;
  }

  /** The ranks `points` buy: a rank a point. */
  static ranksFor(points: number): number {
    return points / POINTS_PER_RANK;
  }

  /**
   * `points` spent on a skill over levels (each with the points it has), first levels first: the ranks they buy, a
   * point a rank, and the points each level spends.
   */
  static spend(points: number, perLevelSkillPoints: number[]): { perLevel: number[]; ranks: number } {
    const perLevel = perLevelSkillPoints.map(() => 0);
    let remaining = points;
    for (const [level, available] of perLevelSkillPoints.entries()) {
      const spent = Math.max(0, Math.min(remaining, available));
      perLevel[level] = spent;
      remaining -= spent;
    }
    return { ranks: SkillRules.ranksFor(points - Math.max(0, remaining)), perLevel };
  }
}
