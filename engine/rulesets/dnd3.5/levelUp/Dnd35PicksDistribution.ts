import { PicksDistribution, type PoolSlots } from "@/engine/core/levelUp/index.ts";
import type { LevelPicks } from "@/engine/core/module/index.ts";
import SkillRules from "@/engine/rulesets/dnd3.5/rules/SkillRules.ts";

/** What 3.5 spreads a save's pooled picks over its planned levels by: each level's pool slots, points and class skills. */
export interface PerLevelDistributionData extends PoolSlots {
  perLevelClassSkillIds: string[][];
  perLevelSkillPoints: number[];
  savedLevelCount: number;
  /** Each skill's rank so far and whether it's a class skill, by its id (`contextsOf`). */
  skillContexts: Map<string, { currentRank: number; isClassSkill: boolean }>;
}

/**
 * A 3.5 save's pooled picks spread over its planned levels (`PicksDistribution`): its feats and powers in their pools'
 * slots, and each skill's points over the levels' points, class-skill levels first, within the skill's rank cap at
 * each level.
 */
export default class Dnd35PicksDistribution extends PicksDistribution<PerLevelDistributionData> {
  /** Each skill's rank so far and whether it's a class skill, which cap its ranks: by its id, of the step's skills. */
  static contextsOf(skills: { currentRank: number; id: string; isClassSkill: boolean }[]) {
    return new Map(skills.map(({ currentRank, id, isClassSkill }) => [id, { currentRank, isClassSkill }]));
  }

  /** Spreads each skill's points over the levels, within each level's points and max ranks. */
  protected override distributeSkills(skills: Record<string, number>, result: LevelPicks[]) {
    const remainingPointsPerLevel = [...this.data.perLevelSkillPoints];

    for (const [skillId, totalPoints] of Object.entries(skills)) {
      if (totalPoints <= 0) continue;

      const { perLevel } = SkillRules.spend(
        skillId,
        totalPoints,
        this.data.perLevelClassSkillIds,
        remainingPointsPerLevel,
      );
      this.capAtMaxRanks(skillId, perLevel, remainingPointsPerLevel);

      for (let i = 0; i < result.length; i++) {
        if (perLevel[i] > 0) {
          result[i].skills[skillId] = (result[i].skills[skillId] ?? 0) + perLevel[i];
          remainingPointsPerLevel[i] -= perLevel[i];
        }
      }
    }
  }

  /** The planned levels: one for each level's skill points. */
  protected override get levelCount() {
    return this.data.perLevelSkillPoints.length;
  }

  /**
   * Caps a skill's points at what each level can take: the ranks its max rank leaves (a cross-class rank costs two
   * points) and the points it has left. What goes over moves on to the next level.
   */
  private capAtMaxRanks(skillId: string, perLevel: number[], remainingPointsPerLevel: number[]) {
    const { data } = this;
    const ctx = data.skillContexts.get(skillId);
    if (!ctx) return;

    let isClassSoFar = ctx.isClassSkill;
    let cumulativeRank = ctx.currentRank;
    let overflow = 0;
    for (let i = 0; i < perLevel.length; i++) {
      perLevel[i] += overflow;
      overflow = 0;

      if (data.perLevelClassSkillIds[i].includes(skillId)) isClassSoFar = true;

      if (perLevel[i] === 0) continue;

      const charLevelAtI = data.savedLevelCount + i + 1;
      const maxRank = SkillRules.maxRank(charLevelAtI, isClassSoFar);
      const isClassForLevel = data.perLevelClassSkillIds[i].includes(skillId);
      const headroom = maxRank - cumulativeRank;
      const maxPointsByRank = Math.max(0, Math.floor(SkillRules.pointsFor(headroom, isClassForLevel)));
      const maxPointsByBudget = remainingPointsPerLevel[i];
      const maxPoints = Math.min(maxPointsByRank, maxPointsByBudget);

      if (perLevel[i] > maxPoints) {
        overflow = perLevel[i] - maxPoints;
        perLevel[i] = maxPoints;
      }
      const actualRank = SkillRules.ranksFor(perLevel[i], isClassForLevel);
      cumulativeRank += actualRank;
    }
  }

  /**
   * What skill points (`points`, by skill, in the order given) come to, skill by skill, as a save spreads them over the
   * levels: the points each keeps, and the ranks they buy.
   */
  spendSkillPoints(points: Record<string, number>) {
    const spent = new Map<string, { points: number; ranks: number }>();
    const levels = this.distribute({ feats: {}, powers: {}, skills: points }, new Map(), new Map());
    for (const [level, picks] of levels.entries()) {
      for (const [skillId, levelPoints] of Object.entries(picks.skills)) {
        const entry = spent.get(skillId) ?? { points: 0, ranks: 0 };
        const isClassSkill = this.data.perLevelClassSkillIds[level].includes(skillId);
        spent.set(skillId, {
          points: entry.points + levelPoints,
          ranks: entry.ranks + SkillRules.ranksFor(levelPoints, isClassSkill),
        });
      }
    }
    return spent;
  }
}
