/**
 * The detail queries of the ruleset entities: an entity of any kind (`entityQuery`), shared by its page and the section
 * rows' hover prefetch so both cache the same response, and an aptitude as a list's aptitude filter reads it.
 */

import { type QueryClient, queryOptions, skipToken } from "@tanstack/react-query";
import { parseResponse } from "hono/client";

import { QUERY_KEYS } from "@/client/src/lib/queryKeys.ts";
import { type Aptitude, entitySegment } from "@/client/src/pages/rulesets/details/sectionQueries.ts";
import { rpc } from "@/client/src/services/rpc.ts";
import { getUrlSegment } from "@/shared/urlSegments.ts";

const rulesetApi = rpc.api.rulesets[":id"];

/** An aptitude, as its pickers read it; skipped without one (a list's aptitude filter, unset). */
export function aptitudeQuery(rulesetId: string, aptitudeId: string | undefined) {
  return queryOptions({
    queryKey: QUERY_KEYS.rulesets.entity(rulesetId, "aptitudes", aptitudeId ?? ""),
    queryFn: aptitudeId
      ? () => parseResponse(rulesetApi.aptitudes[":aptitudeId"].$get({ param: { id: rulesetId, aptitudeId } }))
      : skipToken,
  });
}

/** An entity of any kind (`type`), through the routes by kind, under the key its own page reads it by. */
export function entityQuery(rulesetId: string, type: string, entityId: string) {
  return queryOptions({
    queryKey: QUERY_KEYS.rulesets.entity(rulesetId, type, entityId),
    queryFn: () =>
      parseResponse(
        rulesetApi.entities[":entityType"][":entityId"].$get({
          param: { id: rulesetId, entityType: entitySegment(getUrlSegment(type)), entityId },
        }),
      ),
  });
}

/** An aptitude a list's picker picked, cached as its own read would be, so the filter shows it before any refetch. */
export function seedAptitude(queryClient: QueryClient, rulesetId: string, aptitude: Aptitude) {
  queryClient.setQueryData(aptitudeQuery(rulesetId, aptitude.id).queryKey, aptitude);
}
