import type DetailedCharacter from "@/engine/rulesets/dnd5/model/DetailedCharacter.ts";

import type { PlannedClassLevel } from "./LevelUpBase.ts";
import type { PoolPicks } from "./LevelUpState.ts";
import PlannedLevelsState from "./PlannedLevelsState.ts";
import type { LevelPicks } from "./requests.ts";

/**
 * What D&D 5th Edition computes of a level's save, from the character's rows, which its save checks
 * (`LevelsPlanning`): a level-up's pooled picks spread over its planned levels, and the pools a save's picks overfill.
 */
export default class LevelUpPlan extends PlannedLevelsState {
  /**
   * A save's pooled picks (`picks`) spread over its planned levels (`levels`), each level taking what its slots allow,
   * in order (`distributePlannedPicks`): each level's.
   */
  distributePicks(levels: PlannedClassLevel[], picks: LevelPicks) {
    return this.distributePlannedPicks(this.buildPlannedLevels(levels), picks);
  }

  /**
   * The pools picks (`picks`, which `holder` holds) overfill, as its aptitudes count them: a stackable feat each time
   * it's picked, another pick given twice once, and a spell at its spell level in its pool, where no room takes it.
   * A pool they pick nothing in isn't one, though its room fell under what the character holds (a class level whose
   * requirements a forced multiclass leaves unmet gives none).
   */
  findOverfullPools(holder: DetailedCharacter, picks: Partial<PoolPicks>) {
    return holder.components.aptitudes.getOverfullPools(this.countOwnPicks(picks)).filter(({ picked }) => picked > 0);
  }
}
