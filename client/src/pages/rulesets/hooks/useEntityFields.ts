import { useRulesetRules } from "@/client/src/hooks/index.ts";
import type { EntityField } from "@/client/src/pages/rulesets/details/rulesetQueries.ts";

/** A type's fields when its rules describe none (an ability's). */
const NO_FIELDS: readonly EntityField[] = [];

/**
 * The fields an entity type's form shows, as its ruleset's rules describe them (`rulesets`: its Settings'; an empty
 * list for a type they describe none for): those beside its name, its others, its lists of links. None until its
 * ruleset and its rules load, and why either didn't (`error`).
 */
export function useEntityFields(rulesetId: string, entityType: string) {
  const { rules, error } = useRulesetRules(rulesetId);
  return { error, fields: rules && (rules.fields[entityType] ?? NO_FIELDS) };
}
