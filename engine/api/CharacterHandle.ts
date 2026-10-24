import { type CharacterInput, CharacterInputs } from "@/engine/core/module/index.ts";
import type { RulesetView } from "@/engine/core/view/index.ts";

import type { Module } from "./Modules.ts";

/**
 * A handle bound to a character (`input`, its rows as the view reads them): the character's own, and its level flows'.
 * Its children's rows are read as the view reads them too (`resolveChildren`).
 */
export default abstract class CharacterHandle {
  constructor(
    protected readonly view: RulesetView,
    protected readonly module: Module,
    protected readonly input: CharacterInput,
  ) {}

  /** Its children's inputs, read as the view reads them. */
  protected resolveChildren(children: CharacterInput[]) {
    return CharacterInputs.resolveAll(children, this.view.rulesetData.cow);
  }
}
