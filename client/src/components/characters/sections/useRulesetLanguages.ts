import { useQuery } from "@tanstack/react-query";

import { type RulesetOptions, rulesetOptionsQuery } from "@/client/src/lib/queries.ts";

export type RulesetLanguage = RulesetOptions["languages"][number];

/** Every language of a ruleset, for pickers: the first 100, the most one request returns. */
export function useRulesetLanguages(rulesetId: string | undefined, enabled = true) {
  return useQuery({ ...rulesetOptionsQuery("languages", rulesetId), enabled });
}
