import RulesError from "@/engine/core/RulesError.ts";
import { RequestIds, type RulesetData } from "@/engine/core/view/index.ts";

import {
  type AbilityIncrease,
  type LevelEditRequest,
  type LevelPicks,
  type LevelPlanRequest,
  type LevelQuery,
  type LevelRequest,
  type LevelStep,
  type LevelUpRequest,
  Payloads,
  type PickQuery,
  type PlannedSoFar,
  type PreviewRequest,
  type StepPayload,
  type StepPickerQuery,
} from "./parts/levelUp/index.ts";

/**
 * A level flow's request (a level-up, a saved level's edit, the wizard's preview, a step's or a picker's query) as its
 * ruleset's view (`rulesetData`) reads it: each entity it names by id (a class, a class level, a pool, and what a level
 * picks: an ability increase's ability, a feat, a power, a skill) resolved to the one the view shows in its place, a
 * copy's or a sibling winner's, since the API takes a source's id as well as its copy's. A pick the view has no entity
 * for is refused, naming it (`RequestIds`): read as it was sent, a spell would count at no spell level, a feat in its
 * pool. The level-up handle resolves a request once, as it enters (`LevelUpEngine`), as the character's rows are
 * (`CharacterInputs`): its checks, its preview and the rows a save writes all read the view's ids.
 */
export default class LevelRequests {
  constructor(private readonly rulesetData: RulesetData) {
    this.ids = new RequestIds(rulesetData, "the character's ruleset");
  }

  /** What a level picks by id (an ability to increase, a feat or a power and its pool, a skill), as the view reads it. */
  private readonly ids: RequestIds;

  /** The id that stands for `id` in the view: its copy's or its winner's when it's stale, itself otherwise. */
  private resolve(id: string) {
    return this.rulesetData.cow.resolve(id);
  }

  /** A level's ability increases, each ability the view's. */
  private resolveIncreases(increases: AbilityIncrease[]): AbilityIncrease[] {
    return increases.map((increase) => ({ ...increase, abilityId: this.ids.resolve("abilities", increase.abilityId) }));
  }

  /** A level the request plans: its class, and its ability increases' abilities, the view's. */
  private resolveLevel<L extends Omit<LevelRequest, "hp">>(level: L): L {
    return {
      ...level,
      klassId: this.resolve(level.klassId),
      abilityIncreases: this.resolveIncreases(level.abilityIncreases),
    };
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
   * Feats or powers (`kind`) by pool, each pool and pick the view's: a pool sent by two of its ids gathers their picks,
   * in the order they came.
   */
  private resolvePools(byPool: Record<string, string[]>, kind: "feats" | "powers") {
    const resolved: Record<string, string[]> = {};
    for (const [aptitudeId, ids] of Object.entries(byPool))
      (resolved[this.ids.resolve("aptitudes", aptitudeId)] ??= []).push(...ids.map((id) => this.ids.resolve(kind, id)));
    return resolved;
  }

  /**
   * Skill points by skill, in the order they came, each skill picked (one given points) the view's: a skill sent by two
   * of its ids takes the points of both.
   */
  private resolveSkills(skills: Record<string, number>) {
    const resolved: Record<string, number> = {};
    for (const [skillId, points] of Object.entries(skills)) {
      const id = points > 0 ? this.ids.resolve("skills", skillId) : this.resolve(skillId);
      resolved[id] = (resolved[id] ?? 0) + points;
    }
    return resolved;
  }

  /** A saved level's edit: its ability increases and its picks. */
  resolveEdit(edit: LevelEditRequest): LevelEditRequest {
    return { ...this.resolvePicks(edit), abilityIncreases: this.resolveIncreases(edit.abilityIncreases) };
  }

  /** A level-up: its levels, and the picks it spreads over them. */
  resolveLevelUp({ levels, picks }: LevelUpRequest): LevelUpRequest {
    return { levels: levels.map((level) => this.resolveLevel(level)), picks: this.resolvePicks(picks) };
  }

  /** A picker's query: the level's (`resolveQuery`), the pool it picks in, and the class levels planned after it. */
  resolvePickQuery<Q extends PickQuery>(query: Q): Q {
    const { aptitudeId, laterKlassLevelIds } = query;
    return {
      ...this.resolveQuery(query),
      aptitudeId: this.resolve(aptitudeId),
      ...(laterKlassLevelIds && { laterKlassLevelIds: laterKlassLevelIds.map((id) => this.resolve(id)) }),
    };
  }

  /** A level's (or a level-up's) picks, those it gives: its feats and powers by pool, and its skill points. */
  resolvePicks<P extends Partial<LevelPicks>>(picks: P): P {
    const { feats, powers, skills } = picks;
    return {
      ...picks,
      ...(feats && { feats: this.resolvePools(feats, "feats") }),
      ...(powers && { powers: this.resolvePools(powers, "powers") }),
      ...(skills && { skills: this.resolveSkills(skills) }),
    };
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

  /** What the wizard plans so far: its levels' class levels and ability increases, and what it picked over them. */
  resolvePlanned(planned: PlannedSoFar): PlannedSoFar {
    const { abilityIncreases, featPicks, klassLevelIds, powerPicks, skillPoints } = planned;
    return {
      abilityIncreases: abilityIncreases?.map((increases) => this.resolveIncreases(increases)),
      featPicks: featPicks?.map(({ aptitudeId, featId }) => ({
        aptitudeId: this.ids.resolve("aptitudes", aptitudeId),
        featId: this.ids.resolve("feats", featId),
      })),
      klassLevelIds: klassLevelIds?.map((klassLevelId) => this.resolve(klassLevelId)),
      powerPicks: powerPicks?.map(({ aptitudeId, powerId }) => ({
        aptitudeId: this.ids.resolve("aptitudes", aptitudeId),
        powerId: this.ids.resolve("powers", powerId),
      })),
      skillPoints: skillPoints && this.resolveSkills(skillPoints),
    };
  }

  /** The wizard's preview: the levels it plans, and what it picked over them. */
  resolvePreview({ levels, picks }: PreviewRequest): PreviewRequest {
    return {
      levels: levels.map((level) => this.resolveLevel(level)),
      ...(picks && { picks: this.resolvePicks(picks) }),
    };
  }

  /**
   * A step's query (a picker's too): its level's class and ability increases, what the wizard picked at it, and what it
   * plans before it.
   */
  resolveQuery<Q extends LevelQuery>(query: Q): Q {
    const { abilityIncreases, klassId, picks, planned } = query;
    return {
      ...query,
      ...(abilityIncreases && { abilityIncreases: this.resolveIncreases(abilityIncreases) }),
      ...(klassId !== undefined && { klassId: this.resolve(klassId) }),
      ...(picks && { picks: this.resolvePicks(picks) }),
      ...(planned && { planned: this.resolvePlanned(planned) }),
    };
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
