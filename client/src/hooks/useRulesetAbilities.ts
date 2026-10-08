import { useQuery } from "@tanstack/react-query";

import { type RulesetOptions, rulesetOptionsQuery } from "@/client/src/lib/queries.ts";

export type RulesetAbility = RulesetOptions["abilities"][number];

/** Every ability of a ruleset, for pickers and lookups. */
export function useRulesetAbilities(rulesetId: string | undefined, enabled = true) {
  return useQuery({ ...rulesetOptionsQuery("abilities", rulesetId), enabled });
}
