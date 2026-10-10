import SkillRules from "@/engine/rulesets/dnd3.5/rules/SkillRules.ts";

import PicksDistribution, { type PerLevelDistributionData } from "./PicksDistribution.ts";

/** What points spent on a skill come to, as a save spreads them: the points it keeps, and the ranks they buy. */
interface Spent {
  points: number;
  ranks: number;
}

/**
 * A skill as a skills step lists it: its rank so far, and whether it's a class skill of the character's classes (its
 * rank cap) and of the step's class (`isCurrentClassSkill`).
 */
interface StepSkill {
  currentRank: number;
  id: string;
  isClassSkill: boolean;
  isCurrentClassSkill: boolean;
}

/** The levels a step's points go to: each one's class skills and points, after the character's saved levels. */
export type SpentLevels = Pick<
  PerLevelDistributionData,
  "perLevelClassSkillIds" | "perLevelSkillPoints" | "savedLevelCount"
>;

/**
 * The skill points a level-up's form spends over its levels, as its save spreads them (`PicksDistribution`: class-skill
 * levels first, within each level's points and each skill's rank cap there, in the order the form gave them): what each
 * skill keeps and the ranks that buys, and what the form reads to spend more without a rule of its own.
 */
export default class SkillSpending<T extends StepSkill> {
  constructor(
    private readonly levels: SpentLevels,
    private readonly skills: T[],
  ) {
    this.distribution = new PicksDistribution({
      ...levels,
      perLevelFeatSlots: {},
      perLevelPowerSlots: {},
      skillContexts: PicksDistribution.contextsOf(skills),
    });
  }

  private readonly distribution: PicksDistribution;

  /** The ranks `skillId` gains at each count of points from 0, the others' `points` as given, while it keeps them all. */
  private ranksByPoints(skillId: string, points: Record<string, number>, budget: number) {
    const ranks = [0];
    for (let count = 1; count <= budget; count++) {
      const own = this.spread({ ...points, [skillId]: count }).get(skillId);
      if (!own || own.points < count) break;
      ranks.push(own.ranks);
    }
    return ranks;
  }

  /** What `points` (by skill, in the order given) come to, skill by skill, as a save spreads them over the levels. */
  private spread(points: Record<string, number>) {
    const spent = new Map<string, Spent>();
    for (const [level, picks] of this.distribution.distribute(points, {}, {}, new Map(), new Map()).entries()) {
      for (const [skillId, levelPoints] of Object.entries(picks.skills)) {
        const entry = spent.get(skillId) ?? { points: 0, ranks: 0 };
        const isClassSkill = this.levels.perLevelClassSkillIds[level].includes(skillId);
        spent.set(skillId, {
          points: entry.points + levelPoints,
          ranks: entry.ranks + SkillRules.ranksFor(levelPoints, isClassSkill),
        });
      }
    }
    return spent;
  }

  /**
   * Each of the step's skills with what the form's `points` (by skill, in its order) come to, as a save spreads them, within the
   * `budget` the step gives:
   * - `points`, the points it keeps, and `ranks`, the ranks they buy;
   * - `ranksByPoints`, the ranks it would gain at each count of points from 0, the other skills' points as they are,
   *   up to the most it keeps whole within the budget they leave: what the form's ranks field reads;
   * - `maxPoints`, the most points it keeps spent alone, which picking at random spends up to;
   * - `rankStep`, a rank, or half a rank for a skill no level makes a class skill;
   * - `classSkill`, whether it's a class skill as the form shows it: the step's class's, or the character's classes'
   *   when the levels' classes give different ones.
   */
  describe(points: Record<string, number>, budget: number) {
    const { perLevelClassSkillIds } = this.levels;
    const spread = this.spread(points);
    const spentAll = [...spread.values()].reduce((sum, spent) => sum + spent.points, 0);
    const multiclass = perLevelClassSkillIds.some((ids) => ids.join(",") !== perLevelClassSkillIds[0]?.join(","));
    return this.skills.map((skill) => {
      const own = spread.get(skill.id) ?? { points: 0, ranks: 0 };
      return {
        ...skill,
        classSkill: multiclass ? skill.isClassSkill : skill.isCurrentClassSkill,
        maxPoints: this.ranksByPoints(skill.id, {}, budget).length - 1,
        points: own.points,
        rankStep: perLevelClassSkillIds.some((ids) => ids.includes(skill.id)) ? 1 : 0.5,
        ranks: own.ranks,
        ranksByPoints: this.ranksByPoints(skill.id, points, budget - spentAll + own.points),
      };
    });
  }
}
