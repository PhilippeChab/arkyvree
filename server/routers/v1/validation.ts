/**
 * What several of the public API's routers take: a page of a list, a customized entity, a modifier, an advancement's
 * plan.
 */

import { z } from "zod";

import { Engine } from "@/engine/index.ts";
import { modifierOperator } from "@/server/routers/api/rulesets/customization/validation.ts";
import { idParam, limit, page, stepPayload } from "@/server/routers/api/validation.ts";

/**
 * A step's payload, in its mechanic's shape (`GET …/advancements/steps` names each step's): a `plan`'s tracks, in the
 * order the plan takes their next positions; a `value` per advancement; a `choose`'s options chosen at each; a
 * `spend`'s points on rows; a `pick`'s entities picked in their pools. The engine reads it by its step's mechanic,
 * refusing one in another's shape and each key an entry gives that its shape doesn't take, as the app's routes take
 * it (`stepPayload`). Its description is the document's one word on those shapes: the route checks a list alone, and
 * no answer describes them (the steps name their mechanic, the rules none), so it says them here.
 */
const v1StepPayload = stepPayload.meta({
  type: "array",
  description:
    "A step's payload, in its mechanic's shape, each entry with no other key: `plan` [{ track }], `value` [integer ≥ 0], `choose` [[{ id, amount ≥ 1 }]], `spend` [{ id, points ≥ 0 }] or `pick` [{ id, pool, tier? }]",
});

/** A customization route's entity: the ruleset (`:id`), its kind among those customized (`:kind`), and its id. */
export const customizedParams = idParam.extend({
  entityId: z.string().uuid(),
  kind: z
    .enum(Engine.rules().customizableKinds())
    .meta({ description: "The entity's kind, among those the rules customize" }),
});

/** What a modifier's body says, a character's own and an entity's alike: what it changes, how, and by what. */
export const modifierFields = {
  operator: modifierOperator.meta({ description: "`add`, `subtract`, `multiply`, `divide` or `set`" }),
  target: z
    .string()
    .min(1)
    .meta({ description: "The target path it changes, as `…/customization/target` completes it" }),
  value: z.string().min(1),
};

/**
 * What a modifier's edit says: how it changes its target, and its target and its value where they change. One it
 * leaves out keeps its text and the entities it names, whatever they're called since.
 */
export const modifierEditFields = {
  ...modifierFields,
  target: modifierFields.target
    .optional()
    .meta({ description: "The target path it changes; left out, it keeps its path and the entities that path names" }),
  value: modifierFields.value
    .optional()
    .meta({ description: "Left out, it keeps its value and the entity a value names (a race)" }),
};

/** A page of a list: which, and how many to a page. */
export const PAGE_FILTERS = {
  limit: limit.meta({ description: "How many to a page: 10 unless it says, 100 at most" }),
  page: page.meta({ description: "Which page, from 1" }),
};

/** A plan's steps' payloads, by step name: what an advancement's steps are answered with so far. */
export const planSteps = z.record(z.string().min(1), v1StepPayload);
