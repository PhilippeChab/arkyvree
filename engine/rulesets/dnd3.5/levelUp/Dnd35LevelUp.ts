import type { CharacterInput } from "@/engine/core/module/index.ts";
import type { RulesetView } from "@/engine/core/view/index.ts";
import CharacterBuilder from "@/engine/rulesets/dnd3.5/model/CharacterBuilder.ts";
import ClassPicker from "@/engine/rulesets/dnd3.5/pickers/ClassPicker.ts";
import FeatPicker from "@/engine/rulesets/dnd3.5/pickers/FeatPicker.ts";
import PowerPicker from "@/engine/rulesets/dnd3.5/pickers/PowerPicker.ts";

import BondedPlans from "./BondedPlans.ts";
import LevelEdit from "./LevelEdit.ts";
import LevelRemoval from "./LevelRemoval.ts";
import LevelSelections from "./LevelSelections.ts";
import LevelUpPlan from "./LevelUpPlan.ts";
import LevelUpPreview from "./LevelUpPreview.ts";
import type { PlannedSoFar } from "./LevelUpState.ts";
import LevelUpSteps from "./LevelUpSteps.ts";

/**
 * The 3.5 level-up, as the module answers the server's level flows, each from the rows the server read: the preview,
 * a save's levels and its check, a saved level's edit, the bonded creatures the levels make, the wizard's steps and
 * pickers, and a saved level's selections.
 */
export default class Dnd35LevelUp {
  /** The level-up wizard's ability step: the character's abilities, when the level it adds or edits takes an increase. */
  describeAbilityStep(
    view: RulesetView,
    character: CharacterInput,
    ...args: Parameters<LevelUpSteps["describeAbilityStep"]>
  ) {
    return new LevelUpSteps(view, character).describeAbilityStep(...args);
  }

  /** The level-up wizard's feats step of class `klassId`'s `level`. */
  describeFeatStep(
    view: RulesetView,
    character: CharacterInput,
    ...args: Parameters<LevelUpSteps["describeFeatStep"]>
  ) {
    return new LevelUpSteps(view, character).describeFeatStep(...args);
  }

  /** A saved level's selections, as its edit opens them. */
  describeLevel(view: RulesetView, character: CharacterInput, characterLevelId: string) {
    return new LevelSelections(view, character).describeLevel(characterLevelId);
  }

  /** The level-up wizard's powers step of class `klassId`'s `level`. */
  describePowerStep(
    view: RulesetView,
    character: CharacterInput,
    ...args: Parameters<LevelUpSteps["describePowerStep"]>
  ) {
    return new LevelUpSteps(view, character).describePowerStep(...args);
  }

  /** The level-up wizard's preview of the levels the character plans, each with its ability increase. */
  describePreview(
    view: RulesetView,
    character: CharacterInput,
    ...args: Parameters<LevelUpPreview["describePreview"]>
  ) {
    return new LevelUpPreview(view, character).describePreview(...args);
  }

  /** The level-up wizard's skills step of class `klassId`'s `level`. */
  describeSkillStep(
    view: RulesetView,
    character: CharacterInput,
    ...args: Parameters<LevelUpSteps["describeSkillStep"]>
  ) {
    return new LevelUpSteps(view, character).describeSkillStep(...args);
  }

  /** The class picker for the character, with what the level-up wizard plans so far: its filters, a page described. */
  openClassPicker(view: RulesetView, character: CharacterInput, planned: PlannedSoFar) {
    return new ClassPicker(view, character, planned);
  }

  /** A feat picker for the character: what it offers and leaves out, and a page of options described. */
  openFeatPicker(view: RulesetView, character: CharacterInput, query: ConstructorParameters<typeof FeatPicker>[2]) {
    return new FeatPicker(view, character, query);
  }

  /** A power picker for the character: what it offers and leaves out, and a page of options described. */
  openPowerPicker(view: RulesetView, character: CharacterInput, query: ConstructorParameters<typeof PowerPicker>[2]) {
    return new PowerPicker(view, character, query);
  }

  /**
   * What a master's bonded creatures become as its stored levels make them, from its rows and theirs (`bonded`): each
   * kind's creature removed, kept or made, and the levels it takes or loses.
   */
  planBonded(view: RulesetView, master: CharacterInput, bonded: CharacterInput[]) {
    return BondedPlans.planMasterCreatures(CharacterBuilder.build(view, master), bonded, view.rulesetData);
  }

  /** A saved level's edit: what it writes, checked, and what the master's bonded creatures become with it. */
  planEdit(view: RulesetView, character: CharacterInput, ...args: Parameters<LevelEdit["planEdit"]>) {
    return new LevelEdit(view, character).planEdit(...args);
  }

  /**
   * The levels a level-up saves, checked, with the picks spread over them: the rows the save writes, and what the
   * master's bonded creatures become with them. The character with them is refused with what it fails, unless forced.
   */
  planLevels(view: RulesetView, character: CharacterInput, ...args: Parameters<LevelUpPlan["planLevels"]>) {
    return new LevelUpPlan(view, character).planLevels(...args);
  }

  /** The character's last level removed: the level that goes, and what its bonded creatures become without it. */
  planRemoval(view: RulesetView, character: CharacterInput, bonded: CharacterInput[]) {
    return new LevelRemoval(view, character).planRemoval(bonded);
  }
}
