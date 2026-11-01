/** What several of the public API's routers take: a page of a list, a customized entity, and a level's plan. */

import { z } from "zod";

import { Engine, type StepPayload } from "@/engine/index.ts";
import { idParam, limit, page } from "@/server/routers/api/validation.ts";

/**
 * A step's payload, in its mechanic's shape (`GET …/levels/steps` names each step's): a `plan`'s tracks, in the order
 * the plan takes their next positions; a `value` per advancement; a `choose`'s options chosen at each; a `spend`'s
 * points on rows; a `pick`'s entities picked in their pools. The engine reads it by its step's mechanic, refusing one
 * in another's shape.
 */
const stepPayload: z.ZodType<StepPayload> = z
  .union([
    z.array(z.strictObject({ track: z.string().uuid() })),
    z.array(z.number().int().min(0)),
    z.array(z.array(z.strictObject({ amount: z.number().int().min(1), id: z.string().uuid() }))),
    z.array(z.strictObject({ id: z.string().uuid(), points: z.number().int().min(0) })),
    z.array(z.strictObject({ id: z.string().uuid(), pool: z.string().uuid(), tier: z.string().optional() })),
  ])
  .meta({ description: "A step's payload, in its mechanic's shape: `plan`, `value`, `choose`, `spend` or `pick`" });

/** A customization route's entity: the ruleset (`:id`), its kind among those customized (`:kind`), and its id. */
export const customizedParams = idParam.extend({
  entityId: z.string().uuid(),
  kind: z
    .enum(Engine.storage().customizableKinds())
    .meta({ description: "The entity's kind, among those the rules customize" }),
});

/** A page of a list: which, and how many to a page. */
export const PAGE_FILTERS = {
  limit: limit.meta({ description: "How many to a page: 10 unless it says, 100 at most" }),
  page: page.meta({ description: "Which page, from 1" }),
};

/** A plan's steps' payloads, by step name: what a level's steps are answered with so far. */
export const planSteps = z.record(z.string().min(1), stepPayload);
