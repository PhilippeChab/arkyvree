import { useQuery } from "@tanstack/react-query";
import type { InferResponseType } from "hono/client";

import { rulesetAbilitiesQuery } from "@/client/src/lib/queries.ts";
import type { rpc } from "@/client/src/services/rpc.ts";

export type RulesetAbility = InferResponseType<
  (typeof rpc.api.rulesets)[":id"]["abilities"]["$get"],
  200
>["items"][number];

/** Every ability of a ruleset, for pickers and lookups. */
export function useRulesetAbilities(rulesetId: string | undefined) {
  return useQuery(rulesetAbilitiesQuery(rulesetId));
}
