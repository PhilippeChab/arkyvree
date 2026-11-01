/**
 * A character's levels as v1 answers them: a level's steps without the wizard's words, a saved level's plan, a step's
 * options, and what a plan comes to.
 */

import type { z } from "zod";

import type {
  v1LevelPlan,
  v1LevelPlanAnswer,
  v1LevelSteps,
  v1StepOptions,
} from "@/server/routers/v1/schemas/characters.ts";
import type { CharacterLevelsService } from "@/server/services/characters/levels/index.ts";

import type { Answer } from "./answers.ts";

/** A saved step's payloads, each entry's keys v1 names picked: a choice's, a pick's, a plan's, a spend's, a value. */
type Payloads = Answer<typeof CharacterLevelsService.getLevelPlan>["steps"];

/** A step's answer, by its mechanic, each key v1 names picked. */
type StepAnswer = Answer<typeof CharacterLevelsService.getPlan>["steps"][string];

/** A payload entry's keys v1 names, whatever its mechanic's: none of the app's others. */
const PAYLOAD_KEYS = ["amount", "id", "points", "pool", "position", "tier", "track"] as const;

/** A saved step's payloads, each object entry's keys v1 names picked. */
function toV1Payloads(steps: Payloads): Payloads {
  const pickEntry = (entry: unknown): unknown => {
    if (Array.isArray(entry)) return entry.map(pickEntry);
    if (typeof entry !== "object" || entry === null) return entry;
    return Object.fromEntries(PAYLOAD_KEYS.filter((key) => key in entry).map((key) => [key, (entry as never)[key]]));
  };
  return Object.fromEntries(Object.entries(steps).map(([name, payload]) => [name, pickEntry(payload)])) as Payloads;
}

/** What a room of picks allows, has spent and has left. */
function toV1Room({ allowed, available, spent }: { allowed: number; available: number; spent: number }) {
  return { allowed, available, spent };
}

/** A step's answer, by its mechanic. */
function toV1StepAnswer(step: StepAnswer): z.infer<typeof v1LevelPlanAnswer>["steps"][string] {
  switch (step.mechanic) {
    case "choose":
      return {
        advancements: step.advancements,
        amount: step.amount,
        chosen: step.chosen,
        mechanic: step.mechanic,
        options: step.options.map(({ abbreviation, id, modifier, name, score }) => ({
          abbreviation,
          id,
          modifier,
          name,
          score,
        })),
      };
    case "pick":
      return {
        fitted: step.fitted,
        granted: step.granted.map(({ description, free, id, name }) => ({ description, free, id, name })),
        grouped: step.grouped,
        mechanic: step.mechanic,
        next: step.next,
        picked: Object.fromEntries(
          Object.entries(step.picked).map(([pool, picks]) => [
            pool,
            picks.map(({ description, id, name, tier }) => ({ description, id, name, tier })),
          ]),
        ),
        pools: Object.fromEntries(
          Object.entries(step.pools).map(([pool, room]) => [
            pool,
            {
              ...toV1Room(room),
              id: room.id,
              name: room.name,
              optional: room.optional,
              tiers:
                room.tiers && Object.fromEntries(Object.entries(room.tiers).map(([tier, t]) => [tier, toV1Room(t)])),
            },
          ]),
        ),
      };
    case "plan":
      return { mechanic: step.mechanic };
    case "spend":
      return {
        budget: step.budget,
        mechanic: step.mechanic,
        perAdvancement: step.perAdvancement,
        rows: step.rows.map((row) => ({
          current: row.current,
          description: row.description,
          favored: row.favored,
          group: row.group,
          id: row.id,
          maxPoints: row.maxPoints,
          name: row.name,
          points: row.points,
          shortName: row.shortName,
          step: row.step,
          value: row.value,
          valuesByPoints: row.valuesByPoints,
        })),
      };
    case "value":
      return {
        advancements: step.advancements.map(({ average, max, min, roll }) => ({ average, max, min, roll })),
        mechanic: step.mechanic,
      };
  }
}

/** A saved level's plan, each step's payload as the level saved it. */
export function toV1LevelPlan(plan: Answer<typeof CharacterLevelsService.getLevelPlan>): z.infer<typeof v1LevelPlan> {
  return { editedLevelId: plan.editedLevelId, steps: toV1Payloads(plan.steps) };
}

/** What a plan comes to: its levels, and each step's answer. */
export function toV1LevelPlanAnswer(
  answer: Answer<typeof CharacterLevelsService.getPlan>,
): z.infer<typeof v1LevelPlanAnswer> {
  return {
    advancements: answer.advancements.map(({ id, position, track }) => ({
      id,
      position,
      track: { id: track.id, name: track.name },
    })),
    steps: Object.fromEntries(Object.entries(answer.steps).map(([name, step]) => [name, toV1StepAnswer(step)])),
  };
}

/** A level's steps, in their order, without the words the wizard shows them by. */
export function toV1LevelSteps(
  steps: Answer<typeof CharacterLevelsService.getPlanSteps>,
): z.infer<typeof v1LevelSteps> {
  return {
    steps: steps.steps.map(({ kind, label, mechanic, name, pools }) => ({ kind, label, mechanic, name, pools })),
  };
}

/** A page of a step's options, or of its groups. */
export function toV1StepOptions(
  options: Answer<typeof CharacterLevelsService.getStepOptions>,
): z.infer<typeof v1StepOptions> {
  const items = options.grouped
    ? options.items.map(({ count, description, eligible, group, id, name, requirementTree }) => ({
        count,
        description,
        eligible,
        group,
        id,
        name,
        requirementTree,
      }))
    : options.items.map(({ description, eligible, id, name, requirementTree, track }) => ({
        description,
        eligible,
        id,
        name,
        requirementTree,
        track: track && { left: track.left, positions: [...track.positions] },
      }));
  return { grouped: options.grouped, items, nextPage: options.nextPage ?? null, page: options.page };
}
