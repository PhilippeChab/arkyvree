import RulesError from "@/engine/core/RulesError.ts";

import LevelUpBase from "./LevelUpBase.ts";

/** A character's last level removed, from its rows: the level that goes. */
export default class LevelRemoval<C> extends LevelUpBase<C> {
  /**
   * The level the character took last, which the removal deletes with its picks: refused when it has no level. It has
   * no children to change.
   */
  planRemoval() {
    const level = this.character.rows.advancements.at(-1);
    if (!level) throw new RulesError("not-found", "No level to remove");
    return { ...LevelUpBase.NO_CHILDREN, advancement: level };
  }
}
