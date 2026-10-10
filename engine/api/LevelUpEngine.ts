import type { CharacterInput } from "@/engine/core/module/index.ts";
import type { RulesetView } from "@/engine/core/view/index.ts";

import CharacterHandle from "./CharacterHandle.ts";
import type { Module, Rest } from "./Modules.ts";

/** What its module answers of a character's level flows, past the view and the character the handle binds. */
type Args<K extends keyof Module["levelUp"]> = Rest<Module["levelUp"][K], [RulesetView, CharacterInput]>;

/**
 * The engine bound to a character's level flows: its wizard's steps and pickers, and what its level saves write. Its
 * character's input is read as the view reads it (`CharacterEngine` resolved it), and so are its bonded creatures'.
 */
export default class LevelUpEngine extends CharacterHandle {
  /** The wizard's ability step: the character's abilities, when the level it adds or edits takes an increase. */
  describeAbilityStep(...args: Args<"describeAbilityStep">) {
    return this.module.levelUp.describeAbilityStep(this.view, this.input, ...args);
  }

  /** The wizard's feats step of class `klassId`'s `level`: the pools the character picks feats in, and its grants. */
  describeFeatStep(...args: Args<"describeFeatStep">) {
    return this.module.levelUp.describeFeatStep(this.view, this.input, ...args);
  }

  /** A saved level's selections, as its edit opens them: refused when the character has no such level. */
  describeLevel(...args: Args<"describeLevel">) {
    return this.module.levelUp.describeLevel(this.view, this.input, ...args);
  }

  /** The wizard's powers step of class `klassId`'s `level`: the pools the character picks powers in, and its grants. */
  describePowerStep(...args: Args<"describePowerStep">) {
    return this.module.levelUp.describePowerStep(this.view, this.input, ...args);
  }

  /** The wizard's preview of the levels the character plans, each with its ability increase. */
  describePreview(...args: Args<"describePreview">) {
    return this.module.levelUp.describePreview(this.view, this.input, ...args);
  }

  /** The wizard's skills step of class `klassId`'s `level`: the points to spend and each skill's class status. */
  describeSkillStep(...args: Args<"describeSkillStep">) {
    return this.module.levelUp.describeSkillStep(this.view, this.input, ...args);
  }

  /** The class picker, with what the wizard plans so far: its filters, and a page of classes described. */
  openClassPicker(...args: Args<"openClassPicker">) {
    return this.module.levelUp.openClassPicker(this.view, this.input, ...args);
  }

  /** A feat picker: what it offers and leaves out, and a page of options described. */
  openFeatPicker(...args: Args<"openFeatPicker">) {
    return this.module.levelUp.openFeatPicker(this.view, this.input, ...args);
  }

  /** A power picker: what it offers and leaves out, and a page of options described. */
  openPowerPicker(...args: Args<"openPowerPicker">) {
    return this.module.levelUp.openPowerPicker(this.view, this.input, ...args);
  }

  /** What the character's bonded creatures become as its stored levels make them, from their rows (`bonded`). */
  planBonded(...[bonded, ...rest]: Args<"planBonded">) {
    return this.module.levelUp.planBonded(this.view, this.input, this.resolveBonded(bonded), ...rest);
  }

  /** A saved level's edit: what it writes, checked, and what the bonded creatures become with it. */
  planEdit(...[bonded, ...rest]: Args<"planEdit">) {
    return this.module.levelUp.planEdit(this.view, this.input, this.resolveBonded(bonded), ...rest);
  }

  /**
   * The levels a level-up saves, checked, with the picks spread over them: the rows the save writes, and what the
   * master's bonded creatures become with them. The character with them is refused with what it fails, unless forced.
   */
  planLevels(...[bonded, ...rest]: Args<"planLevels">) {
    return this.module.levelUp.planLevels(this.view, this.input, this.resolveBonded(bonded), ...rest);
  }

  /** The character's last level removed: the level that goes, and what its bonded creatures become without it. */
  planRemoval(...[bonded, ...rest]: Args<"planRemoval">) {
    return this.module.levelUp.planRemoval(this.view, this.input, this.resolveBonded(bonded), ...rest);
  }
}
