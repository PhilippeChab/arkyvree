import RulesError from "@/engine/core/RulesError.ts";
import { RequestIds, type RulesetData } from "@/engine/core/view/index.ts";

import {
  type LevelPlanRequest,
  type LevelStep,
  Payloads,
  type StepPayload,
  type StepPickerQuery,
} from "./parts/levelUp/index.ts";

/**
 * A level flow's plan request (a plan's answer, a step's picker, a level-up's or an edit's save) as its ruleset's view
 * (`rulesetData`) reads it: each entity it names by id (a track, a pool, and what a step chooses, spends on or picks)
 * resolved to the one the view shows in its place, a copy's or a sibling winner's, since the API takes a source's id as
 * well as its copy's. A pick the view has no entity for is refused, naming it (`RequestIds`): read as it was sent, a
 * spell would count at no spell level, a feat in its pool. The level-up handle resolves a request once, as it enters
 * (`LevelUpEngine`), as the character's rows are (`CharacterInputs`): its answers, its checks and the rows a save writes
 * all read the view's ids.
 */
export default class LevelRequests {
  constructor(private readonly rulesetData: RulesetData) {
    this.ids = new RequestIds(rulesetData, "the character's ruleset");
  }

  /** What a level picks by id (an ability to increase, a feat or a spell and its pool, a skill), as the view reads it. */
  private readonly ids: RequestIds;

  /** The id that stands for `id` in the view: its copy's or its winner's when it's stale, itself otherwise. */
  private resolve(id: string) {
    return this.rulesetData.cow.resolve(id);
  }

  /**
   * An id of `kind` the view's: of an entity of that kind when the step names its kind, any entity's when it doesn't.
   */
  private resolveOf(kind: LevelStep["kind"], id: string) {
    return kind ? this.ids.resolve(kind, id) : this.resolve(id);
  }

  /**
   * A step's payload (`payload`), read by its mechanic, each id it names the view's: a plan's tracks, by any kind; the
   * options a `choose` step raises and the rows a `spend` step spends on, of its kind (a row's points gathered when two
   * of its ids name it, a row given none kept as it came); and a `pick` step's picks, of its kind, each in a pool of
   * its pools'.
   */
  private resolvePayload(step: LevelStep, payload: unknown): StepPayload {
    switch (step.mechanic) {
      case "choose":
        return Payloads.read({ name: step.name, mechanic: "choose" }, payload).map((options) =>
          options.map((option) => ({ ...option, id: this.resolveOf(step.kind, option.id) })),
        );
      case "pick":
        return Payloads.read({ name: step.name, mechanic: "pick" }, payload).map((pick) => ({
          ...pick,
          id: this.resolveOf(step.kind, pick.id),
          pool: this.resolveOf(step.pools, pick.pool),
        }));
      case "plan":
        return Payloads.read({ name: step.name, mechanic: "plan" }, payload).map((advancement) => ({
          ...advancement,
          track: this.resolve(advancement.track),
        }));
      case "spend": {
        const points = new Map<string, number>();
        for (const row of Payloads.read({ name: step.name, mechanic: "spend" }, payload)) {
          const id = row.points > 0 ? this.resolveOf(step.kind, row.id) : this.resolve(row.id);
          points.set(id, (points.get(id) ?? 0) + row.points);
        }
        return [...points].map(([id, spent]) => ({ id, points: spent }));
      }
      case "value":
        return Payloads.read({ name: step.name, mechanic: "value" }, payload);
    }
  }

  /**
   * A plan request, as its level's steps (`steps`, as its ruleset lists them) read it: each step's payload in its
   * mechanic's shape, each id it names the view's (`resolvePayload`). A payload of a step the level hasn't is refused.
   */
  resolvePlan(steps: readonly LevelStep[], { editedLevelId, steps: payloads }: LevelPlanRequest): LevelPlanRequest {
    const resolved: Record<string, StepPayload> = {};
    for (const [name, payload] of Object.entries(payloads)) {
      const step = steps.find((listed) => listed.name === name);
      if (!step) throw new RulesError("invalid", `The level has no ${name} step`);
      resolved[name] = this.resolvePayload(step, payload);
    }
    return { ...(editedLevelId && { editedLevelId }), steps: resolved };
  }

  /**
   * A plan request a save writes (`resolvePlan`), which answers every one of its level's steps (`steps`): one it leaves
   * unanswered is refused, so a save never reads a step it skipped as picking nothing.
   */
  resolveSave(steps: readonly LevelStep[], request: LevelPlanRequest): LevelPlanRequest {
    const unanswered = steps.find((step) => request.steps[step.name] === undefined);
    if (unanswered) throw new RulesError("invalid", `The plan doesn't answer its ${unanswered.name} step`);
    return this.resolvePlan(steps, request);
  }

  /**
   * Step `name`'s picker, as its level's steps (`steps`) read it: its plan (`resolvePlan`), and the pool it picks in,
   * of the step's pools' kind. A step the level hasn't is refused.
   */
  resolveStepPicker(steps: readonly LevelStep[], name: string, query: StepPickerQuery): StepPickerQuery {
    const step = steps.find((listed) => listed.name === name);
    if (!step) throw new RulesError("not-found", "Level step not found");
    const { plan, pool } = query;
    return { ...query, plan: this.resolvePlan(steps, plan), ...(pool && { pool: this.resolveOf(step.pools, pool) }) };
  }
}
