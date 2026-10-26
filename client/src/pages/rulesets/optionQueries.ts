/**
 * What a ruleset's pickers offer, searched on the server and paged in as their listbox scrolls (`useListboxQuery`): a
 * kind's entities, and the templates an item can be based on. A picker's options are read here alone, whatever form
 * or tab offers them.
 */

import { infiniteQueryOptions, queryOptions, skipToken } from "@tanstack/react-query";
import { parseResponse } from "hono/client";

import { readEntitiesFn } from "@/client/src/lib/entityRequests.ts";
import { nextPage } from "@/client/src/lib/pageItems.ts";
import { QUERY_KEYS } from "@/client/src/lib/queryKeys.ts";
import { rpc } from "@/client/src/services/rpc.ts";

/**
 * A picker's entities of a kind (`type`), searched on the server, `limit` a page: those of a scope where its kind takes
 * one (an aptitude's: its feats' or its spells'), all of them without one; nothing is asked without a kind. Its key
 * holds its page size, so two pickers of a kind that page it differently never share their pages.
 */
export function entityOptionsQuery(
  rulesetId: string,
  type: string | undefined,
  search: string,
  { limit, scope }: { limit: number; scope?: string },
) {
  return infiniteQueryOptions({
    queryKey: [...QUERY_KEYS.rulesets.sectionSearch(rulesetId, type ?? "", search, scope), limit],
    queryFn:
      type === undefined
        ? skipToken
        : async ({ pageParam }) =>
            readEntitiesFn(rulesetId, type, {
              limit: limit.toString(),
              page: pageParam.toString(),
              search: search || undefined,
              scope,
            }),
    initialPageParam: 1,
    getNextPageParam: nextPage,
  });
}

/**
 * The ruleset's templates of a kind (`entityType`) of a type (`type`: the weapons, armors or shields an item can be
 * based on).
 */
export function templatesQuery(rulesetId: string, entityType: string, type: string) {
  return queryOptions({
    queryKey: QUERY_KEYS.rulesets.templates(rulesetId, entityType, type),
    queryFn: () =>
      parseResponse(
        rpc.api.rulesets[":id"].entities[":entityType"].templates.$get({
          param: { id: rulesetId, entityType },
          query: { type },
        }),
      ),
  });
}
