import { useQuery } from "@tanstack/react-query";
import type { InferResponseType } from "hono/client";

import { rulesetLanguagesQuery } from "@/client/src/lib/queries.ts";
import type { rpc } from "@/client/src/services/rpc.ts";

export type RulesetLanguage = InferResponseType<
  (typeof rpc.api.rulesets)[":id"]["languages"]["$get"],
  200
>["items"][number];

/** Every language of a ruleset, for pickers: the first 100, the most one request returns. */
export function useRulesetLanguages(rulesetId: string | undefined, enabled = true) {
  return useQuery({ ...rulesetLanguagesQuery(rulesetId), enabled });
}
