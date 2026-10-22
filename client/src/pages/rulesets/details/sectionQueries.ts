/**
 * List queries of the ruleset tabs. Each section renders with these, and the tab bar prefetches with the same
 * factories, so a hovered tab's first page is already cached under the exact key the section asks for. What its
 * pickers offer is `optionQueries.ts`'.
 */

import { infiniteQueryOptions, type QueryClient, type QueryKey, skipToken } from "@tanstack/react-query";
import { type InferResponseType, parseResponse } from "hono/client";

import { nextPage } from "@/client/src/lib/pageItems.ts";
import type { Direction } from "@/client/src/lib/queries.ts";
import { QUERY_KEYS } from "@/client/src/lib/queryKeys.ts";
import {
  DEFAULT_ENTITY_FILTERS,
  type EntityKind,
  type EntitySortField,
} from "@/client/src/pages/rulesets/hooks/useEntityFilters.ts";
import { rpc } from "@/client/src/services/rpc.ts";
import { getUrlSegment } from "@/shared/urlSegments.ts";

import { rulesetFieldsQuery, rulesetSettingsQuery } from "./rulesetQueries.ts";

interface AptitudeFilters extends ListFilters {
  aptitudeId?: string;
}

/** A kind's list's filters: past every list's, the kind it's for and its sort, where its kind narrows and sorts it. */
interface EntityFilters extends ListFilters {
  kind?: EntityKind;
  orderBy?: EntitySortField;
  orderDir?: Direction;
}

interface ListFilters {
  childOnly: boolean;
  search: string;
}

interface PowerFilters extends AptitudeFilters {
  level?: number;
}

type AptitudesApi = (typeof rpc.api.rulesets)[":id"]["aptitudes"];

/** An entity kind's URL segment, as the routes by kind take it. */
type EntitySegment = Parameters<
  (typeof rpc.api.rulesets)[":id"]["entities"][":entityType"]["$get"]
>[0]["param"]["entityType"];

/** A ruleset's aptitude, as its list and its pickers give it. */
export type Aptitude = InferResponseType<AptitudesApi["$get"], 200>["items"][number];

/** An entity of any kind, as its list gives it: its name, its description, and what its kind's list reads of it. */
export type EntityRow = InferResponseType<
  (typeof rpc.api.rulesets)[":id"]["entities"][":entityType"]["$get"],
  200
>["items"][number];

/** A ruleset's power (3.5's spell), as its list gives it. */
export type Power = InferResponseType<(typeof rpc.api.rulesets)[":id"]["powers"]["$get"], 200>["items"][number];

/** A ruleset page's tab: an entity kind's, by its URL segment (`races`, `classes`), or its Settings (`settings`). */
export type RulesetSection = string;

/** A tab's search params, and the kind and sort that narrow and order its list where they do (races, classes). */
function entityPageSearchParams(pageParam: number, filters: EntityFilters) {
  return {
    ...pageSearchParams(pageParam, filters),
    kind: filters.kind,
    orderBy: filters.orderBy,
    orderDir: filters.orderDir,
  };
}

/** The key of a list an entity's kind and its sort narrow and order. */
function entitySectionKey(rulesetId: string, section: RulesetSection, filters: EntityFilters) {
  return [...sectionKey(rulesetId, section, filters), filters.kind, filters.orderBy, filters.orderDir] as const;
}

/**
 * Search params, those given alone: a list by kind takes its kind's filters past the shared ones, by any key, each a
 * string.
 */
function givenParams(params: Readonly<Record<string, string | undefined>>) {
  return Object.fromEntries(
    Object.entries(params).flatMap(([key, value]): [string, string][] => (value === undefined ? [] : [[key, value]])),
  );
}

/** A tab's search params: its page, ten rows at a time, its search, and whether it lists the ruleset's own only. */
function pageSearchParams(pageParam: number, { search, childOnly }: ListFilters) {
  return {
    page: pageParam.toString(),
    limit: "10",
    search: search || undefined,
    childOnly: childOnly ? ("true" as const) : undefined,
  };
}

function sectionKey(rulesetId: string, section: RulesetSection, filters: ListFilters) {
  return [...QUERY_KEYS.rulesets.section(rulesetId, section), filters.search, filters.childOnly] as const;
}

/**
 * An entity kind's list (`kind`: its type, and whether it narrows by the kind a race or a class is for and sorts),
 * through the routes by kind, under its tab's key.
 */
export function entitiesQuery(
  rulesetId: string,
  kind: { partitioned?: boolean; type: string },
  filters: EntityFilters,
) {
  const segment = getUrlSegment(kind.type);
  return infiniteQueryOptions({
    queryKey: kind.partitioned
      ? entitySectionKey(rulesetId, segment, filters)
      : sectionKey(rulesetId, segment, filters),
    queryFn: ({ pageParam }) =>
      parseResponse(
        rpc.api.rulesets[":id"].entities[":entityType"].$get({
          param: { id: rulesetId, entityType: entitySegment(segment) },
          query: givenParams(
            kind.partitioned ? entityPageSearchParams(pageParam, filters) : pageSearchParams(pageParam, filters),
          ),
        }),
      ),
    initialPageParam: 1,
    getNextPageParam: nextPage,
  });
}

/** An entity kind's segment as the routes by kind take it: the server refuses one no kind has. */
export function entitySegment(segment: string) {
  return segment as EntitySegment;
}

/** The variants of a feat family, which its grouped row lists as it expands; a row of one feat has none to ask for. */
export function featFamilyQuery(rulesetId: string, family: string | null, childOnly: boolean) {
  return infiniteQueryOptions({
    queryKey: QUERY_KEYS.rulesets.familyVariants(rulesetId, family ?? "", childOnly),
    queryFn: family
      ? ({ pageParam }) =>
          parseResponse(
            rpc.api.rulesets[":id"].feats.$get({
              param: { id: rulesetId },
              query: { limit: "50", page: pageParam.toString(), family, childOnly: childOnly ? "true" : undefined },
            }),
          )
      : skipToken,
    initialPageParam: 1,
    getNextPageParam: nextPage,
  });
}

/** Feats with variant families collapsed into one row each — the Feats tab's default view. */
export function featsGroupedQuery(rulesetId: string, filters: AptitudeFilters) {
  return infiniteQueryOptions({
    queryKey: [
      ...QUERY_KEYS.rulesets.sectionGrouped(rulesetId, "feats"),
      filters.search,
      filters.childOnly,
      filters.aptitudeId,
    ],
    queryFn: ({ pageParam }) =>
      parseResponse(
        rpc.api.rulesets[":id"].feats.grouped.$get({
          param: { id: rulesetId },
          query: { ...pageSearchParams(pageParam, filters), aptitudeId: filters.aptitudeId },
        }),
      ),
    initialPageParam: 1,
    getNextPageParam: nextPage,
  });
}

export function featsQuery(rulesetId: string, filters: AptitudeFilters) {
  return infiniteQueryOptions({
    queryKey: [...sectionKey(rulesetId, "feats", filters), filters.aptitudeId],
    queryFn: ({ pageParam }) =>
      parseResponse(
        rpc.api.rulesets[":id"].feats.$get({
          param: { id: rulesetId },
          query: { ...pageSearchParams(pageParam, filters), aptitudeId: filters.aptitudeId },
        }),
      ),
    initialPageParam: 1,
    getNextPageParam: nextPage,
  });
}

/**
 * After a write to a ruleset's content: the lists it shows in (a section's, a customization tab's, a class's), and the
 * ruleset's Local Changes, which any write can change. It settles once they're read again, for a write that waits.
 */
export function invalidateRulesetEdit(
  queryClient: QueryClient,
  rulesetId: string,
  keys: readonly QueryKey[],
): Promise<void> {
  const all = [...keys, QUERY_KEYS.rulesets.changes(rulesetId)];
  return Promise.all(all.map((queryKey) => queryClient.invalidateQueries({ queryKey }))).then(() => undefined);
}

export function itemsQuery(rulesetId: string, filters: ListFilters) {
  return infiniteQueryOptions({
    queryKey: sectionKey(rulesetId, "items", filters),
    queryFn: ({ pageParam }) =>
      parseResponse(
        rpc.api.rulesets[":id"].items.$get({
          param: { id: rulesetId },
          query: pageSearchParams(pageParam, filters),
        }),
      ),
    initialPageParam: 1,
    getNextPageParam: nextPage,
  });
}

export function powersQuery(rulesetId: string, filters: PowerFilters) {
  return infiniteQueryOptions({
    queryKey: [...sectionKey(rulesetId, "powers", filters), filters.aptitudeId, filters.level],
    queryFn: ({ pageParam }) =>
      parseResponse(
        rpc.api.rulesets[":id"].powers.$get({
          param: { id: rulesetId },
          query: {
            ...pageSearchParams(pageParam, filters),
            aptitudeId: filters.aptitudeId,
            level: filters.level?.toString(),
          },
        }),
      ),
    initialPageParam: 1,
    getNextPageParam: nextPage,
  });
}

/**
 * Warm the first page of a tab the way it opens: switching tabs clears the URL's filters, so that's no search, the
 * default kind and sort, and the ruleset's default "Local Changes" setting. An entity kind's tab (`kind`) not past the
 * feats, the powers and the items lists through the routes by kind.
 */
export function prefetchSection(
  queryClient: QueryClient,
  rulesetId: string,
  section: RulesetSection,
  kind: { partitioned?: boolean; type: string } | null,
  childOnly: boolean,
) {
  const filters = { search: "", childOnly };
  switch (section) {
    case "feats":
      return queryClient.prefetchInfiniteQuery(featsGroupedQuery(rulesetId, filters));
    case "powers":
      return queryClient.prefetchInfiniteQuery(powersQuery(rulesetId, filters));
    case "items":
      return queryClient.prefetchInfiniteQuery(itemsQuery(rulesetId, filters));
    case "settings":
      return Promise.all([
        queryClient.prefetchQuery(rulesetSettingsQuery(rulesetId)),
        queryClient.prefetchQuery(rulesetFieldsQuery(rulesetId)),
      ]);
  }
  if (!kind) return;
  const where = kind.partitioned ? { ...filters, ...DEFAULT_ENTITY_FILTERS } : filters;
  return queryClient.prefetchInfiniteQuery(entitiesQuery(rulesetId, kind, where));
}
