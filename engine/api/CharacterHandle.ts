import { type CharacterInput, CharacterInputs } from "@/engine/core/module/index.ts";
import type { RulesetView } from "@/engine/core/view/index.ts";

import type { Module } from "./Modules.ts";

/**
 * A handle bound to a character (`input`, its rows as the view reads them): the character's own, and its level flows'.
 * Its bonded creatures' rows are read as the view reads them too (`resolveBonded`).
 */
export default abstract class CharacterHandle {
  constructor(
    protected readonly view: RulesetView,
    protected readonly module: Module,
    protected readonly input: CharacterInput,
  ) {}

  /** Bonded creatures' inputs, read as the view reads them. */
  protected resolveBonded(bonded: CharacterInput[]) {
    return CharacterInputs.resolveAll(bonded, this.view.rulesetData.cow);
  }
}
