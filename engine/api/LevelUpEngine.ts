import { type CharacterInput, type LevelPlanRequest, LevelRequests } from "@/engine/core/module/index.ts";
import RulesError from "@/engine/core/RulesError.ts";
import type { RulesetView } from "@/engine/core/view/index.ts";

import CharacterHandle from "./CharacterHandle.ts";
import type { Module, Rest } from "./Modules.ts";

/** What its module answers of a character's level flows, past the view and the character the handle binds. */
type Args<K extends keyof Module["levelUp"]> = Rest<Module["levelUp"][K], [RulesetView, CharacterInput]>;

/**
 * The engine bound to a character's level flows: its wizard's steps and pickers, and what its level saves write. Its
 * character's input is read as the view reads it (`CharacterEngine` resolved it), and so are its bonded creatures' and
 * each request, as it enters (`LevelRequests`): the ids it names resolved to the view's, a pick the view lacks refused.
 */
export default class LevelUpEngine extends CharacterHandle {
  /** The requests the flows take, read as the view reads them. */
  private readonly requests = new LevelRequests(this.view.rulesetData);

  /** The level's steps, each its mechanic's: an edit's (`request.editedLevelId`) without its plan step. */
  private stepsOf(request: { editedLevelId?: string }) {
    return this.module.levelUp.listSteps(this.view, this.input, request.editedLevelId !== undefined).steps;
  }

  /** A saved level's selections, as its edit opens them: refused when the character has no such level. */
  describeLevel(...args: Args<"describeLevel">) {
    return this.module.levelUp.describeLevel(this.view, this.input, ...args);
  }

  /**
   * The plan's answer (`request`, read by its level's steps, each id the view's): each step in its mechanic's shape,
   * Add Level's plan and Edit Level's level alike.
   */
  describePlan(...[request]: Args<"describePlan">) {
    return this.module.levelUp.describePlan(
      this.view,
      this.input,
      this.requests.resolvePlan(this.stepsOf(request), request),
    );
  }

  /** The wizard's preview of the levels the character plans, each with its ability increase. */
  describePreview(...[request]: Args<"describePreview">) {
    return this.module.levelUp.describePreview(this.view, this.input, this.requests.resolvePreview(request));
  }

  /** A saved level as an edit's plan opens it: each step's payload as the level saved it. */
  describeSavedPlan(...[characterLevelId]: Args<"describeSavedPlan">) {
    return this.module.levelUp.describeSavedPlan(this.view, this.input, characterLevelId);
  }

  /** The wizard's step `name` of the level a step is for: refused when the ruleset has no such step. */
  describeStep(...[name, query]: Args<"describeStep">) {
    return this.module.levelUp.describeStep(this.view, this.input, name, this.requests.resolveQuery(query));
  }

  /** The wizard's steps of the level a step is for, in order: each by the name `describeStep` answers it by. */
  describeSteps(...[query]: Args<"describeSteps">) {
    return this.module.levelUp.describeSteps(this.view, this.input, this.requests.resolveQuery(query));
  }

  /**
   * A level's steps, in the wizard's order, each its mechanic's: an edit's (of the character's saved level
   * `editedLevelId`) without its plan step. Refused when the character has no such level.
   */
  listSteps(editedLevelId?: string) {
    if (editedLevelId !== undefined && !this.input.rows.levels.some((level) => level.id === editedLevelId))
      throw new RulesError("not-found", "Character level not found");
    return this.module.levelUp.listSteps(this.view, this.input, editedLevelId !== undefined);
  }

  /** The class picker, with what the wizard plans so far: its filters, and a page of classes described. */
  openClassPicker(...[planned]: Args<"openClassPicker">) {
    return this.module.levelUp.openClassPicker(this.view, this.input, this.requests.resolvePlanned(planned));
  }

  /** A feat picker: what it offers and leaves out, and a page of options described. */
  openFeatPicker(...[query]: Args<"openFeatPicker">) {
    return this.module.levelUp.openFeatPicker(this.view, this.input, this.requests.resolvePickQuery(query));
  }

  /** A power picker: what it offers and leaves out, and a page of options described. */
  openPowerPicker(...[query]: Args<"openPowerPicker">) {
    return this.module.levelUp.openPowerPicker(this.view, this.input, this.requests.resolvePickQuery(query));
  }

  /** Step `step`'s picker over the plan: the kind it reads a page of, and its picker. */
  openStepPicker(...[step, query]: Args<"openStepPicker">) {
    const resolved = this.requests.resolveStepPicker(this.stepsOf(query.plan), step, query);
    return this.module.levelUp.openStepPicker(this.view, this.input, step, resolved);
  }

  /** What the character's bonded creatures become as its stored levels make them, from their rows (`bonded`). */
  planBonded(...[bonded, ...rest]: Args<"planBonded">) {
    return this.module.levelUp.planBonded(this.view, this.input, this.resolveBonded(bonded), ...rest);
  }

  /** A saved level's edit: what it writes, checked, and what the bonded creatures become with it. */
  planEdit(...[bonded, characterLevelId, edit, force]: Args<"planEdit">) {
    const resolved = this.requests.resolveEdit(edit);
    return this.module.levelUp.planEdit(
      this.view,
      this.input,
      this.resolveBonded(bonded),
      characterLevelId,
      resolved,
      force,
    );
  }

  /**
   * A plan's edit of the character's saved level `characterLevelId` (`request`, read by an edit's steps, each id the
   * view's): what it writes, checked, and what the bonded creatures become with it.
   */
  planLevelEdit(bonded: CharacterInput[], characterLevelId: string, request: LevelPlanRequest, force: boolean) {
    const plan = { ...request, editedLevelId: characterLevelId };
    const edit = this.module.levelUp.readEdit(
      this.view,
      this.input,
      this.requests.resolveSave(this.stepsOf(plan), plan),
    );
    return this.module.levelUp.planEdit(
      this.view,
      this.input,
      this.resolveBonded(bonded),
      characterLevelId,
      edit,
      force,
    );
  }

  /**
   * The levels a level-up saves, checked, with the picks spread over them: the rows the save writes, and what the
   * master's bonded creatures become with them. The character with them is refused with what it fails, unless forced.
   */
  planLevels(...[bonded, request, force]: Args<"planLevels">) {
    const resolved = this.requests.resolveLevelUp(request);
    return this.module.levelUp.planLevels(this.view, this.input, this.resolveBonded(bonded), resolved, force);
  }

  /**
   * A plan's level-up (`request`, read by its level's steps, each id the view's): the rows its save writes, checked,
   * and what the master's bonded creatures become with them.
   */
  planLevelUp(bonded: CharacterInput[], request: LevelPlanRequest, force: boolean) {
    const resolved = this.requests.resolveSave(this.stepsOf(request), request);
    const levelUp = this.module.levelUp.readLevelUp(this.view, this.input, resolved);
    return this.module.levelUp.planLevels(this.view, this.input, this.resolveBonded(bonded), levelUp, force);
  }

  /** The character's last level removed: the level that goes, and what its bonded creatures become without it. */
  planRemoval(...[bonded, ...rest]: Args<"planRemoval">) {
    return this.module.levelUp.planRemoval(this.view, this.input, this.resolveBonded(bonded), ...rest);
  }
}
