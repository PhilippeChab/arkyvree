import { useQuery } from "@tanstack/react-query";

import { queryKeys } from "@/client/src/lib/queryKeys.ts";
import { parseResponse, rpc } from "@/client/src/services/rpc.ts";

/** Every save of a ruleset, for pickers, columns and lookups. */
export function useRulesetSaves(rulesetId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: queryKeys.rulesets.saves(rulesetId ?? ""),
    queryFn: async () => {
      const page = await parseResponse(rpc.api.rulesets[":id"].saves.$get({
        param: { id: rulesetId! },
        query: { page: "1", limit: "100" },
      }));
      return page.items;
    },
    enabled: !!rulesetId && enabled,
  });
}
