/**
 * The ruleset page's queries beside its tabs' lists (`sectionQueries.ts`): the extensions it subscribes to, and its
 * local changes, which a dialog shows.
 */

import { queryOptions, skipToken } from "@tanstack/react-query";
import { parseResponse } from "hono/client";

import { QUERY_KEYS } from "@/client/src/lib/queryKeys.ts";
import { rpc } from "@/client/src/services/rpc.ts";

/** What a fork changed from the rulesets it inherits: the Local changes dialog's list. */
export function rulesetChangesQuery(rulesetId: string) {
  return queryOptions({
    queryKey: QUERY_KEYS.rulesets.changes(rulesetId),
    queryFn: () => parseResponse(rpc.api.rulesets[":id"].changes.$get({ param: { id: rulesetId } })),
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
