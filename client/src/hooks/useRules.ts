import { useQuery } from "@tanstack/react-query";

import { type RulesDescription, rulesQuery } from "@/client/src/lib/queries.ts";
import type { BaseRules } from "@/shared/enums.ts";

/**
 * What a base rules' rulesets share (`baseRules`: none while its ruleset loads), as the engine describes it: its words,
 * the kinds a race or a class is for, a class's and a power's levels, its license; none while it loads. `all`: every
 * base rules', for a list of several rulesets' records; `isPending` until they load or fail, and `retry` to ask again
 * once they failed.
 */
export function useRules(baseRules?: BaseRules) {
  const { data, error, isPending, refetch } = useQuery(rulesQuery());
  const rules: RulesDescription | undefined = baseRules && data?.[baseRules];
  return { all: data, error, isPending, retry: () => void refetch(), rules };
}
