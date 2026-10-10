import type { CharacterInput } from "@/engine/core/module/index.ts";

import LevelUpBase from "./LevelUpBase.ts";

/** A master's bonded creatures, from its rows, as its saved levels make them. */
export default class BondedCreatures<C> extends LevelUpBase<C> {
  /**
   * What the master's bonded creatures (`bonded`, their rows) become as its saved levels make them: each kind's
   * creature removed, kept or made, and the levels it takes or loses.
   */
  planBonded(bonded: CharacterInput[]) {
    return this.planBondedOf(this.build(), bonded);
  }
}
