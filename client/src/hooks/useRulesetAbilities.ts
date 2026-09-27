import { skipToken, useQuery } from "@tanstack/react-query";
import type { InferResponseType } from "hono/client";

import { queryKeys } from "@/client/src/lib/queryKeys.ts";
import { parseResponse, rpc } from "@/client/src/services/rpc.ts";

export type RulesetAbility = InferResponseType<(typeof rpc.api.rulesets)[":id"]["abilities"]["$get"], 200>["items"][number];

/** Every ability of a ruleset, for pickers and lookups. */
export function useRulesetAbilities(rulesetId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.rulesets.abilities(rulesetId ?? ""),
    queryFn: rulesetId
      ? async () => {
        const page = await parseResponse(rpc.api.rulesets[":id"].abilities.$get({
          param: { id: rulesetId },
          query: { page: "1", limit: "100" },
        }));
        return page.items;
      }
      : skipToken,
  });
}
