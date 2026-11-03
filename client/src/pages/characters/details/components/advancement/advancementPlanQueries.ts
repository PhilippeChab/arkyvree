/**
 * The advancement wizards' queries, every ruleset's alike, by the steps' mechanics: an advancement's steps, the plan's
 * answer (Add Level's plan and Edit Level's advancement alike), a saved advancement as an edit's plan, and a step's
 * options over the plan. Each builds the request it sends once, and its key holds it: no parameter can be left out of
 * it. Their responses' types are here too, as the API answers them, each step's by its mechanic.
 */

import { infiniteQueryOptions, queryOptions, skipToken } from "@tanstack/react-query";
import { type InferRequestType, type InferResponseType, parseResponse } from "hono/client";

import { FOREVER } from "@/client/src/lib/durations.ts";
import { nextPage } from "@/client/src/lib/pageItems.ts";
import { QUERY_KEYS } from "@/client/src/lib/queryKeys.ts";
import { rpc } from "@/client/src/services/rpc.ts";

type AdvancementsApi = (typeof rpc.api.characters.advancements)[":characterId"];

/** A step's mechanic, which the wizard renders it by. */
type Mechanic = AdvancementStep["mechanic"];

/**
 * Where a step's picker opens: the pool it picks in, its tier, the group whose members it lists, and the advancement
 * its pick lands on.
 */
export interface PickerAt {
  advancement?: number;
  group?: string;
  pool?: string;
  tier?: string;
}

/** A step of an advancement, any mechanic's. */
export type AdvancementStep = AdvancementSteps["steps"][number];

/** An advancement's steps, as the ruleset lists them: the words advancements take, and its steps. */
export type AdvancementSteps = InferResponseType<AdvancementsApi["steps"]["$get"], 200>;

/** A step's answer of mechanic `M`. */
export type AnswerOf<M extends Mechanic> = Extract<PlanAnswer["steps"][string], { mechanic: M }>;

/** The plan's answer: its advancements, and each step's answer by its name. */
export type PlanAnswer = InferResponseType<AdvancementsApi["plan"]["$post"], 200>;

/** A plan, as the plan, its pickers and its saves take it: each step's payload by its name. */
export type PlanRequest = InferRequestType<AdvancementsApi["plan"]["$post"]>["json"];

/** A step of mechanic `M`. */
export type StepOf<M extends Mechanic> = Extract<AdvancementStep, { mechanic: M }>;

/** A step's option, its entity and whether the character may take it. */
export type StepOption = Extract<StepOptionsPage, { grouped: false }>["items"][number];

/** A group of a step's options (a family's row). */
export type StepOptionGroup = Extract<StepOptionsPage, { grouped: true }>["items"][number];

/** A page of a step's options: its rows, groups of them or not. */
export type StepOptionsPage = InferResponseType<AdvancementsApi["options"][":step"]["$post"], 200>;

/**
 * The plan's answer (`request`): each step's, by its mechanic, and the plan's advancements; skipped until there's a plan
 * to answer (`request` none). It holds for as long as the plan does.
 */
export function advancementPlanQuery(characterId: string, request: PlanRequest | undefined) {
  return queryOptions({
    queryKey: QUERY_KEYS.characters.advancement.plan(characterId, request ?? {}),
    queryFn: request
      ? () =>
          parseResponse(
            rpc.api.characters.advancements[":characterId"].plan.$post({ param: { characterId }, json: request }),
          )
      : skipToken,
    staleTime: FOREVER,
  });
}

/**
 * The steps a wizard's advancement has, Add Level's or an edit's (`editedAdvancementId`), in their order: for as long
 * as it's open.
 */
export function advancementStepsQuery(characterId: string, editedAdvancementId?: string) {
  const query = { editedAdvancementId };
  return queryOptions({
    queryKey: QUERY_KEYS.characters.advancement.steps(characterId, query),
    queryFn: () =>
      parseResponse(rpc.api.characters.advancements[":characterId"].steps.$get({ param: { characterId }, query })),
    staleTime: FOREVER,
  });
}

/** A step's answer, narrowed to its mechanic's: none when the plan has none for it, or answers it by another. */
export function answerOf<M extends Mechanic>(answer: PlanAnswer | undefined, step: StepOf<M>) {
  const stepAnswer = answer?.steps[step.name];
  return stepAnswer?.mechanic === step.mechanic ? (stepAnswer as AnswerOf<M>) : undefined;
}

/** A saved advancement as an edit's plan opens it: each step's payload as the advancement saved it. */
export function savedPlanQuery(characterId: string, advancementId: string) {
  return queryOptions({
    queryKey: QUERY_KEYS.characters.advancement.savedPlan(characterId, advancementId),
    queryFn: () =>
      parseResponse(
        rpc.api.characters.advancements[":characterId"][":advancementId"].plan.$get({
          param: { characterId, advancementId },
        }),
      ),
  });
}

/**
 * A step's options over the plan (`plan`), searched, a page at a time: where its picker opens (`at`), and the size of a
 * page; skipped until there's a plan to read them over.
 */
export function stepOptionsQuery(
  characterId: string,
  step: string,
  plan: PlanRequest | undefined,
  at: PickerAt,
  search: string,
  limit: number,
) {
  const json = plan && { ...at, plan };
  const query = { limit: String(limit), search: search || undefined };
  return infiniteQueryOptions({
    queryKey: QUERY_KEYS.characters.advancement.stepOptions(characterId, step, { ...json, ...query }),
    queryFn: json
      ? ({ pageParam }) =>
          parseResponse(
            rpc.api.characters.advancements[":characterId"].options[":step"].$post({
              param: { characterId, step },
              query: { ...query, page: String(pageParam) },
              json,
            }),
          )
      : skipToken,
    initialPageParam: 1,
    getNextPageParam: nextPage,
  });
}
