import { useQuery } from "@tanstack/react-query";

import { type RulesetOptions, rulesetOptionsQuery } from "@/client/src/lib/queries.ts";

/** An ability of a ruleset, as its lists send it. */
export type Ability = RulesetOptions["abilities"][number];

/** Every ability of a ruleset, for pickers and lookups. */
export function useRulesetAbilities(rulesetId: string | undefined) {
  return useQuery(rulesetOptionsQuery("abilities", rulesetId));
}
