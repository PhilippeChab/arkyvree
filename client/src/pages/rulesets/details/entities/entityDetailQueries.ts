/**
 * The detail queries of the ruleset entities: an entity of any kind (`entityQuery`), shared by its page and the section
 * rows' hover prefetch so both cache the same response, and an aptitude as a list's aptitude filter reads it.
 */

import { type QueryClient, queryOptions, skipToken } from "@tanstack/react-query";

import { readEntityFn } from "@/client/src/lib/entityRequests.ts";
import { QUERY_KEYS } from "@/client/src/lib/queryKeys.ts";
import { type Aptitude } from "@/client/src/pages/rulesets/details/sectionQueries.ts";

/** An aptitude, as its pickers read it; skipped without one (a list's aptitude filter, unset). */
export function aptitudeQuery(rulesetId: string, aptitudeId: string | undefined) {
  const read = entityQuery(rulesetId, "aptitudes", aptitudeId ?? "");
  return queryOptions({ queryKey: read.queryKey, queryFn: aptitudeId ? read.queryFn : skipToken });
}

/** An entity of any kind (`type`), through the routes by kind, under the key its own page reads it by. */
export function entityQuery(rulesetId: string, type: string, entityId: string) {
  return queryOptions({
    queryKey: QUERY_KEYS.rulesets.entity(rulesetId, type, entityId),
    queryFn: () => readEntityFn(rulesetId, type, entityId),
  });
}

/** An aptitude a list's picker picked, cached as its own read would be, so the filter shows it before any refetch. */
export function seedAptitude(queryClient: QueryClient, rulesetId: string, aptitude: Aptitude) {
  queryClient.setQueryData(aptitudeQuery(rulesetId, aptitude.id).queryKey, aptitude);
}
