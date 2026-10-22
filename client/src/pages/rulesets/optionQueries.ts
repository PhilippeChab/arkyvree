/**
 * What a ruleset's pickers offer, searched on the server and paged in as their listbox scrolls (`useListboxQuery`): its
 * aptitudes, its feats and its skills, and the templates an item can be based on. A picker's options are read here
 * alone, whatever form or tab offers them.
 */

import { infiniteQueryOptions, queryOptions } from "@tanstack/react-query";
import { parseResponse } from "hono/client";

import { entitySegment, readEntitiesFn } from "@/client/src/lib/entityRequests.ts";
import { nextPage } from "@/client/src/lib/pageItems.ts";
import type { EntityKindDescription } from "@/client/src/lib/queries.ts";
import { QUERY_KEYS } from "@/client/src/lib/queryKeys.ts";
import { rpc } from "@/client/src/services/rpc.ts";

/** The aptitudes a picker offers: those of the ruleset's feats, or of its spells (all of them without one). */
export type AptitudeScope = NonNullable<EntityKindDescription["pools"]>;

/** A picker's aptitudes, searched on the server: a ruleset's, or those of its feats or its spells. */
export function aptitudeOptionsQuery(rulesetId: string, search: string, scope?: AptitudeScope) {
  return infiniteQueryOptions({
    queryKey: QUERY_KEYS.rulesets.sectionSearch(rulesetId, "aptitudes", search, scope),
    queryFn: async ({ pageParam }) =>
      readEntitiesFn(rulesetId, "aptitudes", {
        limit: "10",
        page: pageParam.toString(),
        search: search || undefined,
        scope,
      }),
    initialPageParam: 1,
    getNextPageParam: nextPage,
  });
}

/** A class picker's options: a ruleset's classes, searched on the server, 20 a page. */
export function classOptionsQuery(rulesetId: string, search: string) {
  return infiniteQueryOptions({
    queryKey: QUERY_KEYS.rulesets.sectionSearch(rulesetId, "classes", search),
    queryFn: async ({ pageParam }) =>
      readEntitiesFn(rulesetId, "klasses", { page: pageParam.toString(), limit: "20", search: search || undefined }),
    initialPageParam: 1,
    getNextPageParam: nextPage,
  });
}

/** A feat picker's options: a ruleset's feats with their aptitudes, searched on the server, 50 a page. */
export function featOptionsQuery(rulesetId: string, search: string) {
  return infiniteQueryOptions({
    queryKey: QUERY_KEYS.rulesets.sectionSearch(rulesetId, "feats", search),
    queryFn: async ({ pageParam }) =>
      readEntitiesFn(rulesetId, "feats", { page: pageParam.toString(), limit: "50", search: search || undefined }),
    initialPageParam: 1,
    getNextPageParam: nextPage,
  });
}

/** The ruleset's templates of an item type (its weapons, armors or shields an item can be based on). */
export function itemTemplatesQuery(rulesetId: string, type: string) {
  return queryOptions({
    queryKey: QUERY_KEYS.rulesets.itemTemplates(rulesetId, type),
    queryFn: () =>
      parseResponse(
        rpc.api.rulesets[":id"].entities[":entityType"].templates.$get({
          param: { id: rulesetId, entityType: entitySegment("items") },
          query: { type },
        }),
      ),
  });
}

/** The ruleset's skills the Skills tab adds to a class, searched on the server, 20 a page. */
export function skillOptionsQuery(rulesetId: string, search: string) {
  return infiniteQueryOptions({
    queryKey: QUERY_KEYS.rulesets.sectionSearch(rulesetId, "skills", search),
    queryFn: ({ pageParam }) =>
      readEntitiesFn(rulesetId, "skills", { limit: "20", page: pageParam.toString(), search: search || undefined }),
    initialPageParam: 1,
    getNextPageParam: nextPage,
  });
}
