import {
  type AdvancementPlanRequest,
  AdvancementRequests,
  type CharacterInput,
  type StepPickerQuery,
} from "@/engine/core/module/index.ts";
import type { RulesetView } from "@/engine/core/view/index.ts";

import CharacterHandle from "./CharacterHandle.ts";
import type { EntityType, Module, Rest } from "./Modules.ts";

/** What its module answers of a character's advancement flows, past the view and the character the handle binds. */
type Args<K extends keyof Module["advancements"]> = Rest<Module["advancements"][K], [RulesetView, CharacterInput]>;

/**
 * The engine bound to a character's advancement flows: its wizard's steps and pickers, and what its advancement saves
 * write. Its character's input is read as the view reads it (`CharacterEngine` resolved it), and so are its children's
 * and each request, as it enters (`AdvancementRequests`): the ids it names resolved to the view's, a pick the view
 * lacks refused, and the saved advancement it edits found among the character's, refused when it isn't one, so its
 * module reads the advancement.
 */
export default class AdvancementsEngine extends CharacterHandle {
  /** The requests the flows take, read as the view reads them, the advancements they edit the character's. */
  private readonly requests = new AdvancementRequests(
    this.view.rulesetData,
    this.input.rows.advancements,
    this.module.advancements.advancementWord,
  );

  /** The advancement's steps, each its mechanic's: an edit's (`request.editedAdvancementId`) without its plan step. */
  private stepsOf(request: { editedAdvancementId?: string }) {
    return this.module.advancements.listSteps(this.view, this.input, request.editedAdvancementId !== undefined).steps;
  }

  /**
   * The plan's answer (`request`, read by its advancement's steps, each id the view's, the advancement it edits the
   * character's): each step in its mechanic's shape, Add Level's plan and Edit Level's advancement alike.
   */
  describePlan(request: AdvancementPlanRequest) {
    return this.module.advancements.describePlan(
      this.view,
      this.input,
      this.requests.resolvePlan(this.stepsOf(request), request),
    );
  }

  /**
   * The character's saved advancement `advancementId` as an edit's plan opens it: each step's payload as the
   * advancement saved it. Refused when the character has no such advancement.
   */
  describeSavedPlan(advancementId: string) {
    return this.module.advancements.describeSavedPlan(
      this.view,
      this.input,
      this.requests.findAdvancement(advancementId),
    );
  }

  /**
   * An advancement's steps, in the wizard's order, each its mechanic's (an edit's, of the character's saved advancement
   * `editedAdvancementId`, without its plan step), and the words advancements take. Refused when the character has
   * no such advancement.
   */
  listSteps(editedAdvancementId?: string) {
    if (editedAdvancementId !== undefined) this.requests.findAdvancement(editedAdvancementId);
    return this.module.advancements.listSteps(this.view, this.input, editedAdvancementId !== undefined);
  }

  /**
   * Step `step`'s picker over the plan (`query`): the kind it reads a page of, its picker, and the fields a search of
   * that kind finds an entity by besides its name and text (`searchFields`, its kind's: a feat's family), which its
   * list's search reads too: a picker and its kind's list search by one rule.
   */
  openStepPicker(step: string, query: StepPickerQuery) {
    const resolved = this.requests.resolveStepPicker(this.stepsOf(query.plan), step, query);
    const opened = this.module.advancements.openStepPicker(this.view, this.input, step, resolved);
    return { ...opened, searchFields: this.module.entities.of(this.view, opened.kind as EntityType).searchFields };
  }

  /**
   * A plan's save (`request`, read by its advancement's steps, each id the view's): the rows its save writes, checked,
   * and what the character's children become with them.
   */
  planAddition(children: CharacterInput[], request: AdvancementPlanRequest, force: boolean) {
    const resolved = this.requests.resolveSave(this.stepsOf(request), request);
    return this.module.advancements.planAddition(
      this.view,
      this.input,
      this.resolveChildren(children),
      resolved,
      force,
    );
  }

  /**
   * A plan's edit of the character's saved advancement `advancementId` (`request`, read by an edit's steps, each id the
   * view's): what it writes, checked, and what the children become with it. Refused when the character has no such
   * advancement.
   */
  planAdvancementEdit(
    children: CharacterInput[],
    advancementId: string,
    request: AdvancementPlanRequest,
    force: boolean,
  ) {
    return this.module.advancements.planAdvancementEdit(
      this.view,
      this.input,
      this.resolveChildren(children),
      this.requests.resolveEdit(this.stepsOf({ editedAdvancementId: advancementId }), advancementId, request),
      force,
    );
  }

  /** What the character's children become as its stored advancements make them, from their rows (`children`). */
  planChildren(...[children, ...rest]: Args<"planChildren">) {
    return this.module.advancements.planChildren(this.view, this.input, this.resolveChildren(children), ...rest);
  }

  /** The character's last advancement removed: the advancement that goes, and what its children become without it. */
  planRemoval(...[children, ...rest]: Args<"planRemoval">) {
    return this.module.advancements.planRemoval(this.view, this.input, this.resolveChildren(children), ...rest);
  }
}
