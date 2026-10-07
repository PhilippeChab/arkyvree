/** The identity section's queries: the languages its picker offers. */

import { queryOptions, skipToken } from "@tanstack/react-query";
import { parseResponse } from "hono/client";

import { QUERY_KEYS } from "@/client/src/lib/queryKeys.ts";
import { rpc } from "@/client/src/services/rpc.ts";

/** Every language of a ruleset, for pickers: the first 100, the most one request returns. */
export function rulesetLanguagesQuery(rulesetId: string | undefined) {
  return queryOptions({
    queryKey: QUERY_KEYS.rulesets.languages(rulesetId ?? ""),
    queryFn: rulesetId
      ? async () => {
          const page = await parseResponse(
            rpc.api.rulesets[":id"].languages.$get({
              param: { id: rulesetId },
              query: { page: "1", limit: "100" },
            }),
          );
          return page.items;
        }
      : skipToken,
  });
}
