import type { AdvancementPlanAnswer, StepAnswer } from "@/engine/core/module/index.ts";
import type { AdvancementPlanRequest, StepPickerQuery } from "@/engine/index.ts";
import { CharacterAdvancementsService } from "@/server/services/characters/advancements/index.ts";
import type { Session } from "@/shared/relations.ts";

/** Step `name`'s answer in a plan's answer, of mechanic `mechanic`: refused when the plan answered it by another. */
export function stepAnswerOf<M extends StepAnswer["mechanic"]>(
  answer: AdvancementPlanAnswer,
  name: string,
  mechanic: M,
) {
  const step = answer.steps[name];
  if (step?.mechanic !== mechanic) throw new Error(`The ${name} step answered as ${step?.mechanic}, not ${mechanic}`);
  return step as Extract<StepAnswer, { mechanic: M }>;
}

/** A plan's answer (`plan`), each step by its mechanic, as the advancement wizards ask it. */
export async function getPlanAnswer(session: Session, characterId: string, plan: AdvancementPlanRequest) {
  return await CharacterAdvancementsService.getPlan(session, characterId, plan);
}

/**
 * A page of step `step`'s options over a plan (`plan`), as its picker opens them where `at` says (its pool, its tier,
 * the advancement its pick lands on, a group's members), searched: its rows, groups of them or not.
 */
export async function getStepOptions(
  session: Session,
  characterId: string,
  step: string,
  plan: AdvancementPlanRequest,
  at: Omit<StepPickerQuery, "plan"> = {},
  { limit = 100, page = 1, search }: { limit?: number; page?: number; search?: string } = {},
) {
  return await CharacterAdvancementsService.getStepOptions(
    session,
    characterId,
    step,
    { ...at, plan, search },
    { limit, page },
  );
}
