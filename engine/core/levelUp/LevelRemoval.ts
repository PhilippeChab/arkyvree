import { type CharacterInput, CharacterProjection } from "@/engine/core/module/index.ts";
import RulesError from "@/engine/core/RulesError.ts";

import LevelUpBase from "./LevelUpBase.ts";

/** A character's last level removed, from its rows: the level that goes, and what its bonded creatures become. */
export default class LevelRemoval<C> extends LevelUpBase<C> {
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
    return { bonded: this.planBondedOf(without, bonded), level };
  }
}
