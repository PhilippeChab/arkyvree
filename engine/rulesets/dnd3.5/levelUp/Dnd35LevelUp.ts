import type { CharacterInput } from "@/engine/core/module/index.ts";
import RulesError from "@/engine/core/RulesError.ts";
import type { RulesetView } from "@/engine/core/types.ts";
import BondedPlans from "@/engine/rulesets/dnd3.5/bonded/BondedPlans.ts";
import CharacterBuilder from "@/engine/rulesets/dnd3.5/character/CharacterBuilder.ts";
import type { Klass } from "@/shared/relations.ts";

import ClassPicker from "./ClassPicker.ts";
import FeatPicker from "./FeatPicker.ts";
import LevelEdit from "./LevelEdit.ts";
import LevelSelections from "./LevelSelections.ts";
import LevelUpPlan from "./LevelUpPlan.ts";
import LevelUpSteps, { type Step } from "./LevelUpSteps.ts";
import type { PickQuery } from "./PickerState.ts";
import PowerPicker from "./PowerPicker.ts";

/**
 * The 3.5 level-up, as the module answers the server's level flows, each from the rows the server read: the preview,
 * a save's levels and its check, a saved level's edit, the bonded creatures the levels make, the wizard's steps and
 * pickers, and a saved level's selections.
 */
export class Dnd35LevelUp {
  /** Refuses a character that fails its rules, built from its rows: what it fails, as the refusal's issues. */
  checkCharacter(view: RulesetView, character: CharacterInput) {
    RulesError.refuseIssues(CharacterBuilder.build(view, character).validate().issues);
  }

  /** A saved level's selections, as its edit opens them. */
  describeLevel(view: RulesetView, ...args: Parameters<LevelSelections["describe"]>) {
    return new LevelSelections(view).describe(...args);
  }

  /** The level-up wizard's attributes step. */
  getAttributeSlots(
    view: RulesetView,
    character: CharacterInput,
    excludeCharacterLevelId?: string,
    pendingLevelCount?: number,
  ) {
    return new LevelUpSteps(view, character).getAttributeSlots(excludeCharacterLevelId, pendingLevelCount);
  }

  /** The level-up wizard's feats step of class `klassId`'s `level`. */
  getFeatSlots(view: RulesetView, character: CharacterInput, klassId: string, level: number, step: Step) {
    return new LevelUpSteps(view, character).getFeatSlots(klassId, level, step);
  }

  /** The level-up wizard's preview of the levels the character plans, each with its ability increase. */
  getLevelUpPreview(
    view: RulesetView,
    character: CharacterInput,
    levels: { klassId: string; level: number }[],
    abilityIds: (string | null)[],
  ) {
    return new LevelUpPlan(view, character).getPreview(levels, abilityIds);
  }

  /** The level-up wizard's powers step of class `klassId`'s `level`. */
  getPowerSlots(view: RulesetView, character: CharacterInput, klassId: string, level: number, step: Step) {
    return new LevelUpSteps(view, character).getPowerSlots(klassId, level, step);
  }

  /** The level-up wizard's skills step of class `klassId`'s `level`. */
  getSkillSlots(view: RulesetView, character: CharacterInput, klassId: string, level: number, step: Step) {
    return new LevelUpSteps(view, character).getSkillSlots(klassId, level, step);
  }

  /** The class picker for a page of classes, with the character's highest level in each. */
  openClassPicker(view: RulesetView, klasses: Klass[], maxLevels: Map<string, number>) {
    return new ClassPicker(view, klasses, maxLevels);
  }

  /** A feat picker for the character: what it offers and leaves out, and a page of options annotated. */
  openFeatPicker(view: RulesetView, character: CharacterInput, query: PickQuery) {
    return new FeatPicker(view, character, query);
  }

  /** A power picker for the character: what it offers and leaves out, and a page of options annotated. */
  openPowerPicker(
    view: RulesetView,
    character: CharacterInput,
    query: PickQuery & { excludeSchools?: string[]; powerLevel?: number },
  ) {
    return new PowerPicker(view, character, query);
  }

  /**
   * What a master's bonded creatures become as its levels make them, from its rows and theirs (`bonded`): each kind's
   * creature removed, kept or made, and the levels it takes or loses.
   */
  planBondedCreatures(view: RulesetView, master: CharacterInput, bonded: CharacterInput[]) {
    return BondedPlans.planMasterCreatures(CharacterBuilder.build(view, master), bonded, view.rulesetData);
  }

  /** A saved level's edit: what it writes, checked, and what the master's bonded creatures become with it. */
  planLevelEdit(view: RulesetView, character: CharacterInput, ...args: Parameters<LevelEdit["plan"]>) {
    return new LevelEdit(view, character).plan(...args);
  }

  /** The levels a level-up saves, checked, with the picks spread over them: the rows the save writes. */
  planLevelUp(view: RulesetView, character: CharacterInput, ...args: Parameters<LevelUpPlan["planLevels"]>) {
    return new LevelUpPlan(view, character).planLevels(...args);
  }
}
