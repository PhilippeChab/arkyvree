/** The queries of the customization fields: the aptitudes a picker offers, the completions and the target paths. */

import { infiniteQueryOptions, type QueryClient, queryOptions, skipToken } from "@tanstack/react-query";
import { parseResponse } from "hono/client";

import { FIVE_SECONDS } from "@/client/src/lib/durations.ts";
import { QUERY_KEYS } from "@/client/src/lib/queryKeys.ts";
import { rpc } from "@/client/src/services/rpc.ts";
import type { PropertyEntityType } from "@/shared/customization/entities.ts";
import type { TargetPathKind } from "@/shared/customization/target.ts";
import { getUrlSegment } from "@/shared/urlSegments.ts";

import { type PathInfo, toPathInfo } from "./pathValues.ts";

/** A picker's aptitudes, searched on the server: a ruleset's, or those of its feats or its spells. */
export function aptitudeOptionsQuery(rulesetId: string, search: string, scope?: "feats" | "spells") {
  return infiniteQueryOptions({
    queryKey: QUERY_KEYS.rulesets.sectionSearch(rulesetId, "aptitudes", search, scope),
    queryFn: async ({ pageParam }) => {
      return parseResponse(
        rpc.api.rulesets[":id"].aptitudes.$get({
          param: { id: rulesetId },
          query: {
            limit: "10",
            page: pageParam.toString(),
            search: search || undefined,
            scope: scope || undefined,
          },
        }),
      );
    },
    initialPageParam: 1,
    getNextPageParam: (lastPage) => lastPage.nextPage,
  });
}

/** The property types a ruleset already uses that match what's typed, for an entity type's properties. */
export function propertyTypeCompletionsQuery(rulesetId: string, search: string, entityType?: PropertyEntityType) {
  return infiniteQueryOptions({
    queryKey: QUERY_KEYS.rulesets.propertyTypeCompletions(rulesetId, search, entityType),
    queryFn: ({ pageParam }) =>
      parseResponse(
        rpc.api.rulesets[":id"].customization.properties.types.completions.$get({
          param: { id: rulesetId },
          query: {
            query: search,
            limit: "10",
            page: pageParam.toString(),
            entityType: entityType ? getUrlSegment(entityType) : undefined,
          },
        }),
      ),
    initialPageParam: 1,
    getNextPageParam: (lastPage) => lastPage.nextPage,
    staleTime: FIVE_SECONDS,
  });
}

/** The values a ruleset already gives a property type that match what's typed. */
export function propertyValueCompletionsQuery(rulesetId: string, propertyType: string, search: string) {
  return infiniteQueryOptions({
    queryKey: QUERY_KEYS.rulesets.propertyValueCompletions(rulesetId, propertyType, search),
    queryFn: ({ pageParam }) =>
      parseResponse(
        rpc.api.rulesets[":id"].customization.properties.values.completions.$get({
          param: { id: rulesetId },
          query: { type: propertyType, query: search, limit: "10", page: pageParam.toString() },
        }),
      ),
    initialPageParam: 1,
    getNextPageParam: (lastPage) => lastPage.nextPage,
    staleTime: FIVE_SECONDS,
  });
}

/** Remembers what a path picked from a list takes, which the list carried, so it shows at once. */
export function seedTargetPath(
  queryClient: QueryClient,
  rulesetId: string,
  kind: TargetPathKind,
  picked: PathInfo,
  entityType?: string,
) {
  queryClient.setQueryData(targetPathQuery(rulesetId, kind, picked.path, entityType).queryKey, picked);
}

/**
 * The paths a target path's browser lists: the next segments after `prefix`, or, `flat`, every leaf path that matches
 * the search, whatever the prefix. It waits for the ruleset's id.
 */
export function targetCompletionsQuery(
  rulesetId: string,
  kind: TargetPathKind,
  entityType: string | undefined,
  prefix: string,
  search: string,
  flat: boolean,
) {
  const partialPath = flat ? "" : prefix;
  return infiniteQueryOptions({
    queryKey: QUERY_KEYS.rulesets.targetCompletions(
      rulesetId,
      flat ? `flat:${search}` : prefix,
      kind,
      search,
      entityType,
    ),
    queryFn: rulesetId
      ? async ({ pageParam }) => {
          return parseResponse(
            rpc.api.rulesets[":id"].customization["target"].paths.completions.$post({
              param: { id: rulesetId },
              json: {
                partialPath,
                position: partialPath.length,
                kind,
                entityType: entityType || undefined,
                search: search || undefined,
                flat: flat || undefined,
                limit: 50,
                page: pageParam,
              },
            }),
          );
        }
      : skipToken,
    initialPageParam: 1,
    getNextPageParam: (lastPage) => lastPage.nextPage,
    staleTime: FIVE_SECONDS,
  });
}

/** What a target path takes, once it's a complete path its entity type takes: null while it's incomplete or unknown. */
export function targetPathQuery(rulesetId: string, kind: TargetPathKind, path: string, entityType?: string) {
  return queryOptions({
    queryKey: QUERY_KEYS.rulesets.targetPath(rulesetId, kind, path, entityType),
    queryFn: path
      ? async () => {
          const { target } = await parseResponse(
            rpc.api.rulesets[":id"].customization["target"].paths.validate.$post({
              param: { id: rulesetId },
              json: { path, kind, entityType: entityType || undefined },
            }),
          );
          return target ? toPathInfo(target) : null;
        }
      : skipToken,
  });
}
