/** What the item form reads from its ruleset as it's filled in. */

import { queryOptions } from "@tanstack/react-query";
import { parseResponse } from "hono/client";

import { QUERY_KEYS } from "@/client/src/lib/queryKeys.ts";
import { rpc } from "@/client/src/services/rpc.ts";

import type { TemplateType } from "./itemForm.ts";

/** The ruleset's templates of an item type (its weapons, armors or shields an item can be based on). */
export function itemTemplatesQuery(rulesetId: string, type: TemplateType) {
  return queryOptions({
    queryKey: QUERY_KEYS.rulesets.itemTemplates(rulesetId, type),
    queryFn: () => parseResponse(rpc.api.rulesets[":id"].templates.$get({ param: { id: rulesetId }, query: { type } })),
  });
}
