import { skipToken, useQuery } from "@tanstack/react-query";
import type { InferResponseType } from "hono/client";

import { queryKeys } from "@/client/src/lib/queryKeys.ts";
import { parseResponse, rpc } from "@/client/src/services/rpc.ts";

export type RulesetLanguage = InferResponseType<
  (typeof rpc.api.rulesets)[":id"]["languages"]["$get"],
  200
>["items"][number];

/** Every language of a ruleset, for pickers: the first 100, the most one request returns. */
export function useRulesetLanguages(rulesetId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: queryKeys.rulesets.languages(rulesetId ?? ""),
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
    enabled,
  });
}
