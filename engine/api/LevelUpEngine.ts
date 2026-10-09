import { type CharacterInput, CharacterInputs } from "@/engine/core/module/index.ts";
import type { RulesetView } from "@/engine/core/view/index.ts";

import type { Module, Rest } from "./Modules.ts";

/** What its module answers of a character's level flows, past the view and the character the handle binds. */
type Args<K extends keyof Module["levelUp"]> = Rest<Module["levelUp"][K], [RulesetView, CharacterInput]>;

/**
 * The engine bound to a character's level flows: its wizard's steps and pickers, and what its level saves write. Its
 * character's input is read as the view reads it (`CharacterEngine` resolved it), and so are its bonded creatures'.
 */
export default class LevelUpEngine {
  constructor(
    private readonly view: RulesetView,
    private readonly module: Module,
    private readonly input: CharacterInput,
  ) {}

  /** Bonded creatures' inputs, read as the view reads them. */
  private resolveBonded(bonded: CharacterInput[]) {
    return CharacterInputs.resolveAll(bonded, this.view.rulesetData.cow);
  }

  /** The wizard's attributes step: the character's abilities, when the level it adds or edits takes an increase. */
  getAttributeSlots(...args: Args<"getAttributeSlots">) {
    return this.module.levelUp.getAttributeSlots(this.view, this.input, ...args);
  }

  /** The wizard's feats step of class `klassId`'s `level`: the pools the character picks feats in, and its grants. */
  getFeatSlots(...args: Args<"getFeatSlots">) {
    return this.module.levelUp.getFeatSlots(this.view, this.input, ...args);
  }

  /** The wizard's powers step of class `klassId`'s `level`: the pools the character picks powers in, and its grants. */
  getPowerSlots(...args: Args<"getPowerSlots">) {
    return this.module.levelUp.getPowerSlots(this.view, this.input, ...args);
  }

  /** The wizard's preview of the levels the character plans, each with its ability increase. */
  getPreview(...args: Args<"getLevelUpPreview">) {
    return this.module.levelUp.getLevelUpPreview(this.view, this.input, ...args);
  }

  /** The wizard's skills step of class `klassId`'s `level`: the points to spend and each skill's class status. */
  getSkillSlots(...args: Args<"getSkillSlots">) {
    return this.module.levelUp.getSkillSlots(this.view, this.input, ...args);
  }

  /** The class picker, with the wizard's pending picks: its filters, and a page of classes described. */
  openClassPicker(...args: Args<"openClassPicker">) {
    return this.module.levelUp.openClassPicker(this.view, this.input, ...args);
  }

  /** A feat picker: what it offers and leaves out, and a page of options annotated. */
  openFeatPicker(...args: Args<"openFeatPicker">) {
    return this.module.levelUp.openFeatPicker(this.view, this.input, ...args);
  }

  /** A power picker: what it offers and leaves out, and a page of options annotated. */
  openPowerPicker(...args: Args<"openPowerPicker">) {
    return this.module.levelUp.openPowerPicker(this.view, this.input, ...args);
  }

  /**
   * The levels a level-up saves, checked, with the picks spread over them: the rows the save writes, and what the
   * master's bonded creatures become with them. The character with them is refused with what it fails, unless forced.
   */
  plan(...[bonded, ...rest]: Args<"planLevelUp">) {
    return this.module.levelUp.planLevelUp(this.view, this.input, this.resolveBonded(bonded), ...rest);
  }

  /** What the character's bonded creatures become as its stored levels make them, from their rows (`bonded`). */
  planBonded(...[bonded, ...rest]: Args<"planBondedCreatures">) {
    return this.module.levelUp.planBondedCreatures(this.view, this.input, this.resolveBonded(bonded), ...rest);
  }

  /** A saved level's edit: what it writes, checked, and what the bonded creatures become with it. */
  planEdit(...[bonded, ...rest]: Args<"planLevelEdit">) {
    return this.module.levelUp.planLevelEdit(this.view, this.input, this.resolveBonded(bonded), ...rest);
  }

  /** The character's last level removed: the level that goes, and what its bonded creatures become without it. */
  planRemoval(...[bonded, ...rest]: Args<"planLevelRemoval">) {
    return this.module.levelUp.planLevelRemoval(this.view, this.input, this.resolveBonded(bonded), ...rest);
  }
}
