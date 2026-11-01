/**
 * The detail queries of the ruleset entities: an entity of any kind (`entityQuery`), shared by its page and the section
 * rows' hover prefetch so both cache the same response, and the pool a list's pool filter picked, cached apart: a list's
 * row seeds it, which isn't its page's answer.
 */

import { type QueryClient, queryOptions, skipToken } from "@tanstack/react-query";

import { type EntityRow, readEntityFn } from "@/client/src/lib/entityRequests.ts";
import { QUERY_KEYS } from "@/client/src/lib/queryKeys.ts";

/** An entity of any kind (`type`), through the routes by kind, under the key its own page reads it by. */
export function entityQuery(rulesetId: string, type: string, entityId: string) {
  return queryOptions({
    queryKey: QUERY_KEYS.rulesets.entity(rulesetId, type, entityId),
    queryFn: () => readEntityFn(rulesetId, type, entityId),
  });
}

/** An entity of a kind (`type`) a picker picked, as its row; skipped without one (a list's pool, unset). */
export function pickedEntityQuery(rulesetId: string, type: string, entityId: string | undefined) {
  return queryOptions({
    queryKey: [...QUERY_KEYS.rulesets.entity(rulesetId, type, entityId ?? ""), "picked"],
    queryFn: entityId ? async (): Promise<EntityRow> => await readEntityFn(rulesetId, type, entityId) : skipToken,
  });
}

/** An entity a list's picker picked, cached as its picked read, so the filter shows it before any refetch. */
export function seedEntity(queryClient: QueryClient, rulesetId: string, type: string, entity: EntityRow) {
  queryClient.setQueryData(pickedEntityQuery(rulesetId, type, entity.id).queryKey, entity);
}
