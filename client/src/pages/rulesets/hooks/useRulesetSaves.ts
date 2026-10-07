import { useQuery } from "@tanstack/react-query";
import type { InferResponseType } from "hono/client";

import { rulesetSavesQuery } from "@/client/src/pages/rulesets/details/sectionQueries.ts";
import type { rpc } from "@/client/src/services/rpc.ts";

export type RulesetSave = InferResponseType<(typeof rpc.api.rulesets)[":id"]["saves"]["$get"], 200>["items"][number];

/** Every save of a ruleset, for pickers, columns and lookups. */
export function useRulesetSaves(rulesetId: string | undefined, enabled = true) {
  return useQuery({ ...rulesetSavesQuery(rulesetId), enabled });
}
