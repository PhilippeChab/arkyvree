/**
 * The detail queries of the simple ruleset entities, shared by their page and
 * the section rows' hover prefetch so both cache the same response.
 */
import { queryOptions } from "@tanstack/react-query";

import { queryKeys } from "@/client/src/lib/queryKeys.ts";
import { parseResponse, rpc } from "@/client/src/services/rpc.ts";

const rulesetApi = rpc.api.rulesets[":id"];

export function abilityQuery(rulesetId: string, abilityId: string) {
  return queryOptions({
    queryKey: queryKeys.rulesets.entity(rulesetId, "abilities", abilityId),
    queryFn: () => parseResponse(rulesetApi.abilities[":abilityId"].$get({ param: { id: rulesetId, abilityId } })),
  });
}

export function aptitudeQuery(rulesetId: string, aptitudeId: string) {
  return queryOptions({
    queryKey: queryKeys.rulesets.entity(rulesetId, "aptitudes", aptitudeId),
    queryFn: () => parseResponse(rulesetApi.aptitudes[":aptitudeId"].$get({ param: { id: rulesetId, aptitudeId } })),
  });
}

export function languageQuery(rulesetId: string, languageId: string) {
  return queryOptions({
    queryKey: queryKeys.rulesets.entity(rulesetId, "languages", languageId),
    queryFn: () => parseResponse(rulesetApi.languages[":languageId"].$get({ param: { id: rulesetId, languageId } })),
  });
}

export function mechanicQuery(rulesetId: string, mechanicId: string) {
  return queryOptions({
    queryKey: queryKeys.rulesets.entity(rulesetId, "mechanics", mechanicId),
    queryFn: () => parseResponse(rulesetApi.mechanics[":mechanicId"].$get({ param: { id: rulesetId, mechanicId } })),
  });
}

export function saveQuery(rulesetId: string, saveId: string) {
  return queryOptions({
    queryKey: queryKeys.rulesets.entity(rulesetId, "saves", saveId),
    queryFn: () => parseResponse(rulesetApi.saves[":saveId"].$get({ param: { id: rulesetId, saveId } })),
  });
}

export function skillQuery(rulesetId: string, skillId: string) {
  return queryOptions({
    queryKey: queryKeys.rulesets.entity(rulesetId, "skills", skillId),
    queryFn: () => parseResponse(rulesetApi.skills[":skillId"].$get({ param: { id: rulesetId, skillId } })),
  });
}
