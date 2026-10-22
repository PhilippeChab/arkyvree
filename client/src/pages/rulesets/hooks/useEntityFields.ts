import { useQuery } from "@tanstack/react-query";

import { type EntityField, rulesetFieldsQuery } from "@/client/src/pages/rulesets/details/rulesetQueries.ts";

/** A type's fields when its ruleset declares none (a language's). */
const NO_FIELDS: readonly EntityField[] = [];

/**
 * The fields an entity type's form shows, as its ruleset declares them (`rulesets`: its Settings'; an empty list for a
 * type it declares none for), and why they didn't load: none until they do.
 */
export function useEntityFields(rulesetId: string, entityType: string) {
  const { data, error } = useQuery(rulesetFieldsQuery(rulesetId));
  return { error, fields: data && (Object.entries(data).find(([type]) => type === entityType)?.[1] ?? NO_FIELDS) };
}
