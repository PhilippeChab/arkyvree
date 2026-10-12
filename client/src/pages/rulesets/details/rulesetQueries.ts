/**
 * The ruleset page's queries beside its tabs' lists (`sectionQueries.ts`): the extensions it subscribes to, its local
 * changes, which a dialog shows, the fields its entities' forms show, and its Settings.
 */

import { queryOptions, skipToken } from "@tanstack/react-query";
import { type InferResponseType, parseResponse } from "hono/client";

import { FOREVER } from "@/client/src/lib/durations.ts";
import { QUERY_KEYS } from "@/client/src/lib/queryKeys.ts";
import { rpc } from "@/client/src/services/rpc.ts";

/** A field of an entity's form, as its ruleset declares it: its label, its input, and what that input needs. */
export type EntityField = RulesetFields["feats"][number];

/** The fields each entity type's form shows, and the ruleset's Settings' (`rulesets`), as the ruleset declares them. */
export type RulesetFields = InferResponseType<(typeof rpc.api.rulesets)[":id"]["fields"]["$get"], 200>;

/** What a fork changed from the rulesets it inherits: the Local Changes dialog's list. */
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

/**
 * The fields each entity type's form shows, and the ruleset's Settings' (`rulesets`), as its ruleset declares them:
 * they change only with its rules.
 */
export function rulesetFieldsQuery(rulesetId: string) {
  return queryOptions({
    queryKey: QUERY_KEYS.rulesets.fields(rulesetId),
    queryFn: () => parseResponse(rpc.api.rulesets[":id"].fields.$get({ param: { id: rulesetId } })),
    staleTime: FOREVER,
  });
}

/** The ruleset's Settings: its own fields' values, its own or those its chain holds. */
export function rulesetSettingsQuery(rulesetId: string) {
  return queryOptions({
    queryKey: QUERY_KEYS.rulesets.settings(rulesetId),
    queryFn: () => parseResponse(rpc.api.rulesets[":id"].settings.$get({ param: { id: rulesetId } })),
  });
}
