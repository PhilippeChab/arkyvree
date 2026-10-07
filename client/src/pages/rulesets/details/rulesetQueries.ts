/**
 * The ruleset page's queries beside its tabs' lists (`sectionQueries.ts`): the extensions it subscribes to, and what
 * its dialogs show, its local changes and its contributors.
 */

import { infiniteQueryOptions, queryOptions, skipToken } from "@tanstack/react-query";
import { parseResponse } from "hono/client";

import { nextPage } from "@/client/src/lib/pageItems.ts";
import { QUERY_KEYS } from "@/client/src/lib/queryKeys.ts";
import { rpc } from "@/client/src/services/rpc.ts";

/** What a fork changed from the rulesets it inherits: the Local changes dialog's list. */
export function rulesetChangesQuery(rulesetId: string) {
  return queryOptions({
    queryKey: QUERY_KEYS.rulesets.changes(rulesetId),
    queryFn: () => parseResponse(rpc.api.rulesets[":id"].changes.$get({ param: { id: rulesetId } })),
  });
}

/** A ruleset's contributors and its owner, a page at a time: the Contributors dialog's list. */
export function rulesetContributorsQuery(rulesetId: string) {
  return infiniteQueryOptions({
    queryKey: QUERY_KEYS.rulesets.section(rulesetId, "contributors"),
    queryFn: ({ pageParam }) =>
      parseResponse(
        rpc.api.rulesets[":id"].contributors.$get({
          param: { id: rulesetId },
          query: { page: pageParam.toString(), limit: "10" },
        }),
      ),
    initialPageParam: 1,
    getNextPageParam: nextPage,
  });
}

/**
 * The extensions a ruleset subscribes to, which only one with a parent does: nothing is asked until it's known to have
 * one (`parentId`, its `rulesetId`).
 */
export function rulesetExtensionsQuery(id: string, parentId: string | null | undefined) {
  return queryOptions({
    queryKey: QUERY_KEYS.rulesets.extensions(id),
    queryFn: parentId ? () => parseResponse(rpc.api.rulesets[":id"].extensions.$get({ param: { id } })) : skipToken,
  });
}
