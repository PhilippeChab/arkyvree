/**
 * A ruleset's entities of any kind, through the routes by kind (`/rulesets/:id/entities/:entityType`): a kind's list's
 * page, an entity, and the types they answer with. Every request for a kind's entities goes through here or the routes'
 * own client.
 */

import { type InferResponseType, parseResponse } from "hono/client";

import { rpc } from "@/client/src/services/rpc.ts";

/** An entity as its own read answers it (`readEntityFn`): its row, and whether its delete can be undone. */
export type EntityAnswer = Awaited<ReturnType<typeof readEntityFn>>;

/** An entity of any kind, as its list gives it: its name, its description, and what its kind's list reads of it. */
export type EntityRow = InferResponseType<
  (typeof rpc.api.rulesets)[":id"]["entities"][":entityType"]["$get"],
  200
>["items"][number];

/**
 * Search params, those given alone: a list by kind takes its kind's filters past the shared ones, by any key, each a
 * string.
 */
export function givenParams(params: Readonly<Record<string, string | undefined>>) {
  return Object.fromEntries(
    Object.entries(params).flatMap(([key, value]): [string, string][] => (value === undefined ? [] : [[key, value]])),
  );
}

/**
 * A page of a kind's list (`type`), narrowed by its query (`query`: its page, its search, its kind's filters, those
 * undefined dropped): a query's `queryFn`.
 */
export function readEntitiesFn(rulesetId: string, type: string, query: Readonly<Record<string, string | undefined>>) {
  return parseResponse(
    rpc.api.rulesets[":id"].entities[":entityType"].$get({
      param: { id: rulesetId, entityType: type },
      query: givenParams(query),
    }),
  );
}

/** An entity of a kind (`type`), as its page reads it: a query's `queryFn`. */
export function readEntityFn(rulesetId: string, type: string, entityId: string) {
  return parseResponse(
    rpc.api.rulesets[":id"].entities[":entityType"][":entityId"].$get({
      param: { id: rulesetId, entityType: type, entityId },
    }),
  );
}
