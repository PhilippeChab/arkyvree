/**
 * The detail queries of the simple ruleset entities, shared by their page and the section rows' hover prefetch so both
 * cache the same response.
 */

import { type QueryClient, queryOptions, skipToken } from "@tanstack/react-query";
import { parseResponse } from "hono/client";

import { QUERY_KEYS } from "@/client/src/lib/queryKeys.ts";
import type { Aptitude } from "@/client/src/pages/rulesets/details/sectionQueries.ts";
import { rpc } from "@/client/src/services/rpc.ts";

const rulesetApi = rpc.api.rulesets[":id"];

export function abilityQuery(rulesetId: string, abilityId: string) {
  return queryOptions({
    queryKey: QUERY_KEYS.rulesets.entity(rulesetId, "abilities", abilityId),
    queryFn: () => parseResponse(rulesetApi.abilities[":abilityId"].$get({ param: { id: rulesetId, abilityId } })),
  });
}

/** An aptitude; skipped without one (a list's aptitude filter, unset). */
export function aptitudeQuery(rulesetId: string, aptitudeId: string | undefined) {
  return queryOptions({
    queryKey: QUERY_KEYS.rulesets.entity(rulesetId, "aptitudes", aptitudeId ?? ""),
    queryFn: aptitudeId
      ? () => parseResponse(rulesetApi.aptitudes[":aptitudeId"].$get({ param: { id: rulesetId, aptitudeId } }))
      : skipToken,
  });
}

export function languageQuery(rulesetId: string, languageId: string) {
  return queryOptions({
    queryKey: QUERY_KEYS.rulesets.entity(rulesetId, "languages", languageId),
    queryFn: () => parseResponse(rulesetApi.languages[":languageId"].$get({ param: { id: rulesetId, languageId } })),
  });
}

export function mechanicQuery(rulesetId: string, mechanicId: string) {
  return queryOptions({
    queryKey: QUERY_KEYS.rulesets.entity(rulesetId, "mechanics", mechanicId),
    queryFn: () => parseResponse(rulesetApi.mechanics[":mechanicId"].$get({ param: { id: rulesetId, mechanicId } })),
  });
}

export function saveQuery(rulesetId: string, saveId: string) {
  return queryOptions({
    queryKey: QUERY_KEYS.rulesets.entity(rulesetId, "saves", saveId),
    queryFn: () => parseResponse(rulesetApi.saves[":saveId"].$get({ param: { id: rulesetId, saveId } })),
  });
}

/** An aptitude a list's picker picked, cached as its own read would be, so the filter shows it before any refetch. */
export function seedAptitude(queryClient: QueryClient, rulesetId: string, aptitude: Aptitude) {
  queryClient.setQueryData(aptitudeQuery(rulesetId, aptitude.id).queryKey, aptitude);
}

export function skillQuery(rulesetId: string, skillId: string) {
  return queryOptions({
    queryKey: QUERY_KEYS.rulesets.entity(rulesetId, "skills", skillId),
    queryFn: () => parseResponse(rulesetApi.skills[":skillId"].$get({ param: { id: rulesetId, skillId } })),
  });
}
