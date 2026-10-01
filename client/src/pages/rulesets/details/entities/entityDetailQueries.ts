/**
 * The detail queries of the simple ruleset entities, shared by their page and
 * the section rows' hover prefetch so both cache the same response.
 */
import { queryOptions } from "@tanstack/react-query";

import { queryKeys } from "@/client/src/lib/queryKeys.ts";
import { parseResponse, rpc } from "@/client/src/services/rpc.ts";

const rulesetApi = rpc.api.rulesets[":id"];

export const abilityQuery = (rulesetId: string, abilityId: string) =>
  queryOptions({
    queryKey: queryKeys.rulesets.entity(rulesetId, "abilities", abilityId),
    queryFn: () => parseResponse(rulesetApi.abilities[":abilityId"].$get({ param: { id: rulesetId, abilityId } })),
  });

export const aptitudeQuery = (rulesetId: string, aptitudeId: string) =>
  queryOptions({
    queryKey: queryKeys.rulesets.entity(rulesetId, "aptitudes", aptitudeId),
    queryFn: () => parseResponse(rulesetApi.aptitudes[":aptitudeId"].$get({ param: { id: rulesetId, aptitudeId } })),
  });

export const languageQuery = (rulesetId: string, languageId: string) =>
  queryOptions({
    queryKey: queryKeys.rulesets.entity(rulesetId, "languages", languageId),
    queryFn: () => parseResponse(rulesetApi.languages[":languageId"].$get({ param: { id: rulesetId, languageId } })),
  });

export const mechanicQuery = (rulesetId: string, mechanicId: string) =>
  queryOptions({
    queryKey: queryKeys.rulesets.entity(rulesetId, "mechanics", mechanicId),
    queryFn: () => parseResponse(rulesetApi.mechanics[":mechanicId"].$get({ param: { id: rulesetId, mechanicId } })),
  });

export const saveQuery = (rulesetId: string, saveId: string) =>
  queryOptions({
    queryKey: queryKeys.rulesets.entity(rulesetId, "saves", saveId),
    queryFn: () => parseResponse(rulesetApi.saves[":saveId"].$get({ param: { id: rulesetId, saveId } })),
  });

export const skillQuery = (rulesetId: string, skillId: string) =>
  queryOptions({
    queryKey: queryKeys.rulesets.entity(rulesetId, "skills", skillId),
    queryFn: () => parseResponse(rulesetApi.skills[":skillId"].$get({ param: { id: rulesetId, skillId } })),
  });
