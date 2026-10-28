import type { CharacterInput } from "@/engine/core/module/CharacterInputs.ts";
import type { OpenedStepPicker } from "@/engine/core/module/pickers.ts";
import type { StoredAdvancement } from "@/engine/core/module/storage.ts";
import type { RulesetView } from "@/engine/core/view/index.ts";

import type {
  LevelPlanAnswer,
  LevelPlanRequest,
  LevelSteps,
  ResolvedEdit,
  ResolvedPlan,
  StepPickerQuery,
} from "./mechanics.ts";
import type { ChildrenPlan, LevelEditPlan, LevelRemovalPlan, LevelsPlan } from "./plans.ts";

/**
 * What a ruleset answers of a character's levels, from the rows the server reads: a level's steps by their mechanics,
 * the plan's answer and a step's picker over it, a saved level as an edit's plan, and what a save, an edit or a removal
 * writes, with what the character's children (3.5's bonded creatures) become. Its answers are in core's shapes, a
 * step's options among them; its plans are the rows the server writes. A plan the server hands it is read by the
 * level's steps, each id the view's, and the saved level it edits is one of the character's, found by the level-up
 * handle (`ResolvedPlan`), which refuses one the character hasn't.
 */
export default abstract class LevelUpPart {
  /**
   * The plan's answer (`plan`): each step's answer in its mechanic's shape, by its name, and the plan's advancements;
   * Add Level's plan, and Edit Level's level in its place (`plan.editedLevel`) alike.
   */
  abstract describePlan(view: RulesetView, character: CharacterInput, plan: ResolvedPlan): LevelPlanAnswer;

  /** The character's saved level `level` as an edit's plan opens it: each step's payload as the level saved it. */
  abstract describeSavedPlan(view: RulesetView, character: CharacterInput, level: StoredAdvancement): LevelPlanRequest;

  /**
   * A level's steps, in the wizard's order, each its mechanic's (an edit's, `edited`, without the step that plans the
   * track its level is on, which an edit keeps), and the words its advancements take.
   */
  abstract listSteps(view: RulesetView, character: CharacterInput, edited: boolean): LevelSteps;

  /**
   * Step `step`'s picker over the plan (`query`), at the advancement its pick lands on: the kind it reads a page of,
   * the read it takes, and the page it read as the step's options. Refused for a step that opens none.
   */
  abstract openStepPicker(
    view: RulesetView,
    character: CharacterInput,
    step: string,
    query: StepPickerQuery<ResolvedPlan>,
  ): OpenedStepPicker;

  /** What a character's children (`children`, their rows) become as its saved levels make them. */
  abstract planChildren(view: RulesetView, character: CharacterInput, children: CharacterInput[]): ChildrenPlan;

  /**
   * A plan's edit (`plan`) of the character's saved level (`plan.editedLevel`): what it writes, checked unless `force`d,
   * and what the children become with it.
   */
  abstract planLevelEdit(
    view: RulesetView,
    character: CharacterInput,
    children: CharacterInput[],
    plan: ResolvedEdit,
    force: boolean,
  ): LevelEditPlan;

  /**
   * A plan's level-up (`plan`): the levels it writes with their rows, each checked and the character with them refused
   * with what it fails unless `force`d, and what the character's children become.
   */
  abstract planLevelUp(
    view: RulesetView,
    character: CharacterInput,
    children: CharacterInput[],
    plan: ResolvedPlan,
    force: boolean,
  ): LevelsPlan;

  /** The character's last level removed: the level that goes, and what its children become without it. */
  abstract planRemoval(view: RulesetView, character: CharacterInput, children: CharacterInput[]): LevelRemovalPlan;
}
