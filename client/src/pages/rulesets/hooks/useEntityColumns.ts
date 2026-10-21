import type { EntityField } from "@/client/src/pages/rulesets/details/rulesetQueries.ts";

import { useRulesetRules } from "./useRulesetRules.ts";

/** No columns: an entity type its rules give none of its own (an ability, a feat), or while its rules load. */
const NO_COLUMNS: readonly EntityField[] = [];

/**
 * The columns an entity type's form shows beside its name and description, as its ruleset's rules describe them (a
 * class's hit die, an item's cost and type): none until its ruleset and its rules load, or for a type with none.
 */
export function useEntityColumns(rulesetId: string, entityType: string) {
  const { rules, error } = useRulesetRules(rulesetId);
  return { columns: rules?.columns[entityType] ?? NO_COLUMNS, error };
}
