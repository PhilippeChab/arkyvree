import type { CharacterInput } from "@/engine/core/module/CharacterInputs.ts";
import type { OpenedStepPicker } from "@/engine/core/module/pickers.ts";
import type { StoredAdvancement } from "@/engine/core/module/storage.ts";
import type { RulesetView } from "@/engine/core/view/index.ts";
import type { RulesWord } from "@/shared/rulesets.ts";

import type {
  AdvancementPlanAnswer,
  AdvancementPlanRequest,
  AdvancementSteps,
  ResolvedEdit,
  ResolvedPlan,
  StepPickerQuery,
} from "./mechanics.ts";
import type { AdvancementEditPlan, AdvancementRemovalPlan, AdvancementsPlan, ChildrenPlan } from "./plans.ts";

/**
 * What a ruleset answers of a character's advancements, from the rows the server reads: an advancement's steps by their
 * mechanics, the plan's answer and a step's picker over it, a saved advancement as an edit's plan, and what a save, an
 * edit or a removal writes, with what the character's children (3.5's bonded creatures) become. Its answers are in
 * core's shapes, a step's options among them; its plans are the rows the server writes. A plan the server hands it is
 * read by the advancement's steps, each id the view's, and the saved advancement it edits is one of the character's,
 * found by the advancement handle (`ResolvedPlan`), which refuses one the character hasn't.
 */
export default abstract class AdvancementsPart {
  /**
   * Its word for an advancement ("Level", 3.5's character level): what the core's refusals name one by, and what its
   * sheets' summary calls one (`SheetSummary.words.advancement`), which the engine fills in from it.
   */
  abstract readonly advancementWord: RulesWord;

  /**
   * The plan's answer (`plan`): each step's answer in its mechanic's shape, by its name, and the plan's advancements;
   * Add Level's plan, and Edit Level's advancement in its place (`plan.editedAdvancement`) alike.
   */
  abstract describePlan(view: RulesetView, character: CharacterInput, plan: ResolvedPlan): AdvancementPlanAnswer;

  /**
   * The character's saved advancement `advancement` as an edit's plan opens it: each step's payload as the advancement
   * saved it.
   */
  abstract describeSavedPlan(
    view: RulesetView,
    character: CharacterInput,
    advancement: StoredAdvancement,
  ): AdvancementPlanRequest;

  /**
   * An advancement's steps, in the wizard's order, each its mechanic's (an edit's, `edited`, without the step that
   * plans the track its advancement is on, which an edit keeps), and the words advancements take.
   */
  abstract listSteps(view: RulesetView, character: CharacterInput, edited: boolean): AdvancementSteps;

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

  /**
   * A plan's save (`plan`): the advancements it writes with their rows, each checked and the character with them
   * refused with what it fails unless `force`d, and what the character's children become.
   */
  abstract planAddition(
    view: RulesetView,
    character: CharacterInput,
    children: CharacterInput[],
    plan: ResolvedPlan,
    force: boolean,
  ): AdvancementsPlan;

  /**
   * A plan's edit (`plan`) of the character's saved advancement (`plan.editedAdvancement`): what it writes, checked
   * unless `force`d, and what the children become with it.
   */
  abstract planAdvancementEdit(
    view: RulesetView,
    character: CharacterInput,
    children: CharacterInput[],
    plan: ResolvedEdit,
    force: boolean,
  ): AdvancementEditPlan;

  /** What a character's children (`children`, their rows) become as its saved advancements make them. */
  abstract planChildren(view: RulesetView, character: CharacterInput, children: CharacterInput[]): ChildrenPlan;

  /** The character's last advancement removed: the advancement that goes, and what its children become without it. */
  abstract planRemoval(
    view: RulesetView,
    character: CharacterInput,
    children: CharacterInput[],
  ): AdvancementRemovalPlan;
}
