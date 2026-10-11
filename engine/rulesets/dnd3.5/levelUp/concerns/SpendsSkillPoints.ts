import type { LevelUpBase } from "@/engine/core/levelUp/index.ts";
import Dnd35PicksDistribution, {
  type PerLevelDistributionData,
} from "@/engine/rulesets/dnd3.5/levelUp/Dnd35PicksDistribution.ts";
import type DetailedCharacter from "@/engine/rulesets/dnd3.5/model/DetailedCharacter.ts";
import type { Constructor } from "@/lib/mixins.ts";

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
 * A level-up's skills step, the wizard's and the preview's alike: the skill points the character spends, and what the
 * form's points come to over the step's levels, as a save spreads them (`Dnd35PicksDistribution`: class-skill levels
 * first, within each level's points and each skill's rank cap there, in the order the form gave them).
 */
export function SpendsSkillPoints<B extends Constructor<LevelUpBase<DetailedCharacter>>>(Base: B) {
  abstract class SpendingSkillPoints extends Base {
    /**
     * Each of the step's skills (`skills`) with what the form's `points` (by skill, in its order) come to over the
     * step's `levels`, as a save spreads them, within the `budget` the step gives:
     * - `points`, the points it keeps, and `ranks`, the ranks they buy;
     * - `ranksByPoints`, the ranks it would gain at each count of points from 0, the other skills' points as they are,
     *   up to the most it keeps whole within the budget they leave: what the form's ranks field reads;
     * - `maxPoints`, the most points it keeps spent alone, which picking at random spends up to;
     * - `rankStep`, a rank, or half a rank for a skill no level makes a class skill;
     * - `classSkill`, whether it's a class skill as the form shows it: the step's class's, or the character's classes'
     *   when the levels' classes give different ones.
     */
    private describeSpending<T extends StepSkill>(
      levels: SpentLevels,
      skills: T[],
      points: Record<string, number>,
      budget: number,
    ) {
      const { perLevelClassSkillIds } = levels;
      const distribution = new Dnd35PicksDistribution({
        ...levels,
        perLevelFeatSlots: {},
        perLevelPowerSlots: {},
        skillContexts: Dnd35PicksDistribution.contextsOf(skills),
      });
      const spread = distribution.spendSkillPoints(points);
      const spentAll = [...spread.values()].reduce((sum, spent) => sum + spent.points, 0);
      const multiclass = perLevelClassSkillIds.some((ids) => ids.join(",") !== perLevelClassSkillIds[0]?.join(","));
      return skills.map((skill) => {
        const own = spread.get(skill.id) ?? { points: 0, ranks: 0 };
        return {
          ...skill,
          classSkill: multiclass ? skill.isClassSkill : skill.isCurrentClassSkill,
          maxPoints: this.ranksByPoints(distribution, skill.id, {}, budget).length - 1,
          points: own.points,
          rankStep: perLevelClassSkillIds.some((ids) => ids.includes(skill.id)) ? 1 : 0.5,
          ranks: own.ranks,
          ranksByPoints: this.ranksByPoints(distribution, skill.id, points, budget - spentAll + own.points),
        };
      });
    }

    /**
     * The ranks `skillId` gains at each count of points from 0, the others' `points` as given, while it keeps them all,
     * as `distribution` spreads them.
     */
    private ranksByPoints(
      distribution: Dnd35PicksDistribution,
      skillId: string,
      points: Record<string, number>,
      budget: number,
    ) {
      const ranks = [0];
      for (let count = 1; count <= budget; count++) {
        const own = distribution.spendSkillPoints({ ...points, [skillId]: count }).get(skillId);
        if (!own || own.points < count) break;
        ranks.push(own.ranks);
      }
      return ranks;
    }

    /** The skill points a level-up step spends: what the character has left to spend, at least one. */
    protected getSkillPointsToSpend(character: DetailedCharacter) {
      return Math.max(1, character.components.skills.getSkillBudget().available);
    }

    /**
     * A skills step, the wizard's and the preview's alike: the points the character has to spend (at least one), the
     * character's total level after the step's levels (`levels`: each one's class skills and points), and each skill
     * with its class status (`classSkillIds`: the step's classes') and what the form's points (`points`, by skill, in
     * its order) come to over the levels, as a save spreads them.
     */
    protected skillStep(
      character: DetailedCharacter,
      classSkillIds: Set<string>,
      levels: SpentLevels,
      points: Record<string, number>,
    ) {
      const skillPointsToSpend = this.getSkillPointsToSpend(character);
      const stepSkills = character.components.skills.getEnrichedSkills(this.rulesetData.skills, classSkillIds);
      return {
        skillPointsToSpend,
        totalCharacterLevel: levels.savedLevelCount + levels.perLevelSkillPoints.length,
        skills: this.describeSpending(levels, stepSkills, points, skillPointsToSpend),
      };
    }
  }
  return SpendingSkillPoints;
}
