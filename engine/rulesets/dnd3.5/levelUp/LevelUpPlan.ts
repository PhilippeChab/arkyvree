import type { PlannedClassLevel } from "@/engine/core/levelUp/index.ts";
import type { LevelPicks, PlannedSoFar } from "@/engine/core/module/index.ts";
import type DetailedCharacter from "@/engine/rulesets/dnd3.5/model/DetailedCharacter.ts";

import type { PoolPicks } from "./LevelUpState.ts";
import PlannedLevelsState from "./PlannedLevelsState.ts";

/**
 * What 3.5 computes of a level's save, from the character's rows, which core's save checks (`LevelsPlanning`): a
 * level-up's pooled picks spread over its planned levels, the pools a save's picks overfill, and the skill points the
 * wizard has spent so far, spread as a save spreads them.
 */
export default class LevelUpPlan extends PlannedLevelsState {
  /**
   * A save's pooled picks (`picks`) spread over its planned levels (`levels`), each level taking what its points and
   * slots allow, in order (`distributePlannedPicks`): each level's.
   */
  distributePicks(levels: PlannedClassLevel[], picks: LevelPicks) {
    return this.distributePlannedPicks(this.buildPlannedLevels(levels), picks);
  }

  /**
   * The pools picks (`picks`, which `holder` holds) overfill, as its aptitudes count them: a stackable feat each time
   * it's picked, another pick given twice once, and a power at its spell level in its pool.
   */
  findOverfullPools(holder: DetailedCharacter, picks: Partial<PoolPicks>) {
    return holder.components.aptitudes.getOverfullPools(this.countOwnPicks(picks));
  }

  /**
   * The skill points the level-up wizard has spent so far (`planned.skillPoints`), spread over the levels it plans as a
   * save spreads them (within each level's points and max ranks, class skills first): each planned level's skill rows,
   * which the class picker projects. Refused when a planned level isn't one of the view's class levels.
   */
  spreadSkillPoints({ abilityIncreases = [], klassLevelIds = [], skillPoints = {} }: PlannedSoFar) {
    if (Object.keys(skillPoints).length === 0) return [];
    const klassLevelEntries = klassLevelIds.map((klassLevelId, i) => ({
      ...this.getSavedKlassLevel({ klassLevelId }),
      abilityIncreases: abilityIncreases[i] ?? [],
    }));
    const distributed = this.distributePicks(klassLevelEntries, { feats: {}, powers: {}, skills: skillPoints });
    return distributed.map((levelPicks) => this.toPickRows(levelPicks).skills);
  }
}
