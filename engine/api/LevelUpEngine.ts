import {
  type CharacterInput,
  type LevelPlanRequest,
  LevelRequests,
  type StepPickerQuery,
} from "@/engine/core/module/index.ts";
import type { RulesetView } from "@/engine/core/view/index.ts";

import CharacterHandle from "./CharacterHandle.ts";
import type { Module, Rest } from "./Modules.ts";

/** What its module answers of a character's level flows, past the view and the character the handle binds. */
type Args<K extends keyof Module["levelUp"]> = Rest<Module["levelUp"][K], [RulesetView, CharacterInput]>;

/**
 * The engine bound to a character's level flows: its wizard's steps and pickers, and what its level saves write. Its
 * character's input is read as the view reads it (`CharacterEngine` resolved it), and so are its children's and
 * each request, as it enters (`LevelRequests`): the ids it names resolved to the view's, a pick the view lacks refused,
 * and the saved level it edits found among the character's, refused when it isn't one, so its module reads the level.
 */
export default class LevelUpEngine extends CharacterHandle {
  /** The requests the flows take, read as the view reads them, the levels they edit the character's. */
  private readonly requests = new LevelRequests(this.view.rulesetData, this.input.rows.advancements);

  /** The level's steps, each its mechanic's: an edit's (`request.editedLevelId`) without its plan step. */
  private stepsOf(request: { editedLevelId?: string }) {
    return this.module.levelUp.listSteps(this.view, this.input, request.editedLevelId !== undefined).steps;
  }

  /**
   * The plan's answer (`request`, read by its level's steps, each id the view's, the level it edits the character's):
   * each step in its mechanic's shape, Add Level's plan and Edit Level's level alike.
   */
  describePlan(request: LevelPlanRequest) {
    return this.module.levelUp.describePlan(
      this.view,
      this.input,
      this.requests.resolvePlan(this.stepsOf(request), request),
    );
  }

  /**
   * The character's saved level `advancementId` as an edit's plan opens it: each step's payload as the level saved it.
   * Refused when the character has no such level.
   */
  describeSavedPlan(advancementId: string) {
    return this.module.levelUp.describeSavedPlan(this.view, this.input, this.requests.findLevel(advancementId));
  }

  /**
   * A level's steps, in the wizard's order, each its mechanic's (an edit's, of the character's saved level
   * `editedLevelId`, without its plan step), and the words its advancements take. Refused when the character has no
   * such level.
   */
  listSteps(editedLevelId?: string) {
    if (editedLevelId !== undefined) this.requests.findLevel(editedLevelId);
    return this.module.levelUp.listSteps(this.view, this.input, editedLevelId !== undefined);
  }

  /** Step `step`'s picker over the plan (`query`): the kind it reads a page of, and its picker. */
  openStepPicker(step: string, query: StepPickerQuery) {
    const resolved = this.requests.resolveStepPicker(this.stepsOf(query.plan), step, query);
    return this.module.levelUp.openStepPicker(this.view, this.input, step, resolved);
  }

  /** What the character's children become as its stored levels make them, from their rows (`children`). */
  planChildren(...[children, ...rest]: Args<"planChildren">) {
    return this.module.levelUp.planChildren(this.view, this.input, this.resolveChildren(children), ...rest);
  }

  /**
   * A plan's edit of the character's saved level `advancementId` (`request`, read by an edit's steps, each id the
   * view's): what it writes, checked, and what the children become with it. Refused when the character has no such
   * level.
   */
  planLevelEdit(children: CharacterInput[], advancementId: string, request: LevelPlanRequest, force: boolean) {
    return this.module.levelUp.planLevelEdit(
      this.view,
      this.input,
      this.resolveChildren(children),
      this.requests.resolveEdit(this.stepsOf({ editedLevelId: advancementId }), advancementId, request),
      force,
    );
  }

  /**
   * A plan's level-up (`request`, read by its level's steps, each id the view's): the rows its save writes, checked,
   * and what the character's children become with them.
   */
  planLevelUp(children: CharacterInput[], request: LevelPlanRequest, force: boolean) {
    const resolved = this.requests.resolveSave(this.stepsOf(request), request);
    return this.module.levelUp.planLevelUp(this.view, this.input, this.resolveChildren(children), resolved, force);
  }

  /** The character's last level removed: the level that goes, and what its children become without it. */
  planRemoval(...[children, ...rest]: Args<"planRemoval">) {
    return this.module.levelUp.planRemoval(this.view, this.input, this.resolveChildren(children), ...rest);
  }
}
