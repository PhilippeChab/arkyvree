/** The rows of a customization's tabs that their section reads itself: an entity's modifiers and requirements. */

import { queryOptions } from "@tanstack/react-query";
import { parseResponse } from "hono/client";

import { QUERY_KEYS } from "@/client/src/lib/queryKeys.ts";
import { rpc } from "@/client/src/services/rpc.ts";

const customizationApi = rpc.api.rulesets[":id"].customization[":entityType"][":entityId"];

export function modifiersQuery(rulesetId: string, entityType: string, entityId: string) {
  return queryOptions({
    queryKey: QUERY_KEYS.rulesets.customization(rulesetId, entityType, entityId, "modifiers"),
    queryFn: () => parseResponse(customizationApi.modifiers.$get({ param: { id: rulesetId, entityType, entityId } })),
  });
}

export function requirementsQuery(rulesetId: string, entityType: string, entityId: string) {
  return queryOptions({
    queryKey: QUERY_KEYS.rulesets.customization(rulesetId, entityType, entityId, "requirements"),
    queryFn: () =>
      parseResponse(
        customizationApi.requirements.$get({
          param: { id: rulesetId, entityType, entityId },
        }),
      ),
  });
}
