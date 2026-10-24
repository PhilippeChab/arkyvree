import type { CharacterInput } from "@/engine/core/module/CharacterInputs.ts";
import type { Descriptions } from "@/engine/core/module/contract.ts";
import type { RulesetView } from "@/engine/core/view/index.ts";

import type { LevelPlanAnswer, LevelPlanRequest, LevelSteps, StepPickerQuery } from "./mechanics.ts";
import type { ChildrenPlan, LevelEditPlan, LevelRemovalPlan, LevelsPlan } from "./plans.ts";

/**
 * What a ruleset answers of a character's levels, from the rows the server reads: a level's steps by their mechanics,
 * the plan's answer and a step's picker over it, a saved level as an edit's plan, and what a save, an edit or a removal
 * writes, with what the character's children (3.5's bonded creatures) become. Its descriptions are the ruleset's own (`D`); its plans are
 * the rows the server writes. A plan the server hands it is read by the level's steps, each id the view's.
 */
export default abstract class LevelUpPart<D extends Descriptions> {
  /**
   * The plan's answer (`request`): each step's answer in its mechanic's shape, by its name, and the plan's
   * advancements; Add Level's plan, and Edit Level's level in its place (`request.editedLevelId`) alike.
   */
  abstract describePlan(view: RulesetView, character: CharacterInput, request: LevelPlanRequest): LevelPlanAnswer;

  /**
   * The character's saved level `characterLevelId` as an edit's plan opens it: each step's payload as the level saved
   * it. Refused when the character has no such level.
   */
  abstract describeSavedPlan(view: RulesetView, character: CharacterInput, characterLevelId: string): LevelPlanRequest;

  /**
   * A level's steps, in the wizard's order, each its mechanic's (an edit's, `edited`, without the step that plans the
   * track its level is on, which an edit keeps), and the words its advancements take.
   */
  abstract listSteps(view: RulesetView, character: CharacterInput, edited: boolean): LevelSteps;

  /**
   * Step `step`'s picker over the plan (`query`), at the advancement its pick lands on: the kind it reads a page of,
   * and its picker. Refused for a step that opens none.
   */
  abstract openStepPicker(
    view: RulesetView,
    character: CharacterInput,
    step: string,
    query: StepPickerQuery,
  ): D["stepPicker"];

  /** What a character's children (`children`, their rows) become as its saved levels make them. */
  abstract planChildren(view: RulesetView, character: CharacterInput, children: CharacterInput[]): ChildrenPlan;

  /**
   * A plan's edit (`request`) of the character's saved level `characterLevelId`: what it writes, checked unless
   * `force`d, and what the children become with it.
   */
  abstract planLevelEdit(
    view: RulesetView,
    character: CharacterInput,
    children: CharacterInput[],
    characterLevelId: string,
    request: LevelPlanRequest,
    force: boolean,
  ): LevelEditPlan;

  /**
   * A plan's level-up (`request`): the levels it writes with their rows, each checked and the character with them
   * refused with what it fails unless `force`d, and what the character's children become.
   */
  abstract planLevelUp(
    view: RulesetView,
    character: CharacterInput,
    children: CharacterInput[],
    request: LevelPlanRequest,
    force: boolean,
  ): LevelsPlan;

  /** The character's last level removed: the level that goes, and what its children become without it. */
  abstract planRemoval(view: RulesetView, character: CharacterInput, children: CharacterInput[]): LevelRemovalPlan;
}
