import { useQuery } from "@tanstack/react-query";

import { type RulesetFields, rulesetFieldsQuery } from "@/client/src/pages/rulesets/details/rulesetQueries.ts";

/**
 * The fields an entity type's form shows, as its ruleset declares them (`rulesets`: its Settings'), and why they didn't
 * load: none until they do.
 */
export function useEntityFields(rulesetId: string, entityType: keyof RulesetFields) {
  const { data, error } = useQuery(rulesetFieldsQuery(rulesetId));
  return { error, fields: data?.[entityType] };
}
