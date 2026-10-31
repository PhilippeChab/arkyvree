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

/** A saved level's plan, each step's payload as the level saved it. */
export function toV1LevelPlan(plan: Answer<typeof CharacterLevelsService.getLevelPlan>): z.infer<typeof v1LevelPlan> {
  return { editedLevelId: plan.editedLevelId, steps: plan.steps };
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
    steps: answer.steps,
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
  return { grouped: options.grouped, items: options.items, nextPage: options.nextPage ?? null, page: options.page };
}
