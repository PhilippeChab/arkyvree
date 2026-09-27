import { useQuery } from "@tanstack/react-query";

import { queryKeys } from "@/client/src/lib/queryKeys.ts";
import { parseResponse, rpc } from "@/client/src/services/rpc.ts";

/** Feats of a ruleset with their aptitudes, for pickers: the first 100, the most one request returns. */
export function useRulesetFeats(rulesetId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: queryKeys.rulesets.feats(rulesetId ?? ""),
    queryFn: async () => {
      const page = await parseResponse(rpc.api.rulesets[":id"].feats.$get({
        param: { id: rulesetId! },
        query: { page: "1", limit: "100" },
      }));
      return page.items;
    },
    enabled: !!rulesetId && enabled,
  });
}
