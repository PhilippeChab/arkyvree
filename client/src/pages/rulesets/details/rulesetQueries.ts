/**
 * The ruleset page's queries beside its tabs' lists (`sectionQueries.ts`): the extensions it subscribes to, its local
 * changes, which a dialog shows, and its Settings; and a field of its forms, as its rules describe it.
 */

import { queryOptions, skipToken } from "@tanstack/react-query";
import { parseResponse } from "hono/client";

import type { RulesDescription } from "@/client/src/lib/queries.ts";
import { QUERY_KEYS } from "@/client/src/lib/queryKeys.ts";
import { rpc } from "@/client/src/services/rpc.ts";

/**
 * A field of an entity's form (or the ruleset's Settings'), as its rules describe it (`RulesDescription.fields`): its
 * label, its input, what that input needs, and where its form shows it.
 */
export type EntityField = NonNullable<RulesDescription["fields"][string]>[number];

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

/** The ruleset's Settings: its own fields' values, its own or those its chain holds. */
export function rulesetSettingsQuery(rulesetId: string) {
  return queryOptions({
    queryKey: QUERY_KEYS.rulesets.settings(rulesetId),
    queryFn: () => parseResponse(rpc.api.rulesets[":id"].settings.$get({ param: { id: rulesetId } })),
  });
}
