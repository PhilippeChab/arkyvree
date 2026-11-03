import { useQuery } from "@tanstack/react-query";

import { rulesetDetailQuery } from "@/client/src/lib/queries.ts";

import { useRules } from "./useRules.ts";

/**
 * What a ruleset's base rules share, as the engine describes them (its words, its entities' fields, its kinds…): none
 * until the ruleset and its rules load, and why either failed (`error`).
 */
export function useRulesetRules(rulesetId: string) {
  const { data: ruleset, error: rulesetError } = useQuery(rulesetDetailQuery(rulesetId));
  const { error, rules } = useRules(ruleset?.baseRules);
  return { error: error ?? rulesetError, rules };
}
