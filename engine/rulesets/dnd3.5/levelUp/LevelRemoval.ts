import { type CharacterInput, CharacterProjection } from "@/engine/core/module/index.ts";
import RulesError from "@/engine/core/RulesError.ts";
import type { RulesetView } from "@/engine/core/view/index.ts";

import BondedPlans from "./BondedPlans.ts";
import LevelUpState from "./LevelUpState.ts";

/** A character's last level removed, from its rows: the level that goes, and what its bonded creatures become. */
export default class LevelRemoval extends LevelUpState {
  constructor(
    view: RulesetView,
    private readonly character: CharacterInput,
  ) {
    super(view);
  }

  /**
   * The level the character took last, which the removal deletes with its picks, and what its bonded creatures
   * (`bonded`, their rows) become without it: refused when it has no level.
   */
  planRemoval(bonded: CharacterInput[]) {
    const level = this.character.rows.levels.at(-1);
    if (!level) throw new RulesError("not-found", "No level to remove");
    const projection = new CharacterProjection(this.character);
    projection.dropLevel(level.id);
    const without = this.build(projection);
    return { bonded: BondedPlans.planMasterCreatures(without, bonded, this.rulesetData), level };
  }
}
