/**
 * List queries of the ruleset tabs. Each section renders with these, and the tab bar prefetches with the same
 * factories, so a hovered tab's first page is already cached under the exact key the section asks for.
 */

import {
  type DefaultError,
  infiniteQueryOptions,
  type QueryClient,
  type QueryKey,
  queryOptions,
  skipToken,
} from "@tanstack/react-query";
import { parseResponse } from "hono/client";

import { QUERY_KEYS } from "@/client/src/lib/queryKeys.ts";
import { rpc } from "@/client/src/services/rpc.ts";

import { DEFAULT_ENTITY_FILTERS, type EntityKind, type EntitySortField } from "./useEntityFilters.ts";

interface AptitudeFilters extends ListFilters {
  aptitudeId?: string;
}

interface EntityFilters extends ListFilters {
  kind: EntityKind;
  orderBy: EntitySortField;
  orderDir: "asc" | "desc";
}

interface ListFilters {
  childOnly: boolean;
  search: string;
}

interface PowerFilters extends AptitudeFilters {
  level?: number;
}

export type RulesetSection =
  | "races"
  | "languages"
  | "skills"
  | "feats"
  | "powers"
  | "items"
  | "classes"
  | "aptitudes"
  | "saves"
  | "abilities"
  | "mechanics";

function listQuery(pageParam: number, { search, childOnly }: ListFilters) {
  return {
    page: pageParam.toString(),
    limit: "10",
    search: search || undefined,
    childOnly: childOnly ? ("true" as const) : undefined,
  };
}

function nextPage(lastPage: { nextPage?: number }) {
  return lastPage.nextPage;
}

function sectionKey(rulesetId: string, section: RulesetSection, filters: ListFilters) {
  return [...QUERY_KEYS.rulesets.section(rulesetId, section), filters.search, filters.childOnly] as const;
}

export function abilitiesQuery(rulesetId: string, childOnly: boolean) {
  return queryOptions({
    queryKey: [...QUERY_KEYS.rulesets.section(rulesetId, "abilities"), childOnly],
    queryFn: () =>
      parseResponse(
        rpc.api.rulesets[":id"].abilities.$get({
          param: { id: rulesetId },
          query: { page: "1", limit: "10", childOnly: childOnly ? "true" : undefined },
        }),
      ),
  });
}

export function aptitudesQuery(rulesetId: string, filters: ListFilters) {
  return infiniteQueryOptions({
    queryKey: sectionKey(rulesetId, "aptitudes", filters),
    queryFn: ({ pageParam }) =>
      parseResponse(
        rpc.api.rulesets[":id"].aptitudes.$get({
          param: { id: rulesetId },
          query: listQuery(pageParam, filters),
        }),
      ),
    initialPageParam: 1,
    getNextPageParam: nextPage,
  });
}

export function classesQuery(rulesetId: string, filters: EntityFilters) {
  return infiniteQueryOptions({
    queryKey: [...sectionKey(rulesetId, "classes", filters), filters.kind, filters.orderBy, filters.orderDir],
    queryFn: ({ pageParam }) =>
      parseResponse(
        rpc.api.rulesets[":id"].classes.$get({
          param: { id: rulesetId },
          query: {
            ...listQuery(pageParam, filters),
            kind: filters.kind,
            orderBy: filters.orderBy,
            orderDir: filters.orderDir,
          },
        }),
      ),
    initialPageParam: 1,
    getNextPageParam: nextPage,
  });
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
          query: { ...listQuery(pageParam, filters), aptitudeId: filters.aptitudeId },
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
          query: { ...listQuery(pageParam, filters), aptitudeId: filters.aptitudeId },
        }),
      ),
    initialPageParam: 1,
    getNextPageParam: nextPage,
  });
}

/**
 * The rows of a section that doesn't read them itself (they're handed over, or it only creates): cached under the
 * section's key, which its saves refresh, and never fetched.
 */
export function heldSectionQuery<TData>(rulesetId: string, sectionName: string) {
  return queryOptions<TData[], DefaultError, TData[], ReturnType<typeof QUERY_KEYS.rulesets.section>>({
    queryKey: QUERY_KEYS.rulesets.section(rulesetId, sectionName),
    queryFn: skipToken,
  });
}

/**
 * After a write to a ruleset's content: the lists it shows in (a section's, a customization tab's, a class's), and the
 * ruleset's Local Changes, which any write can change.
 */
export function invalidateRulesetEdit(queryClient: QueryClient, rulesetId: string, keys: readonly QueryKey[]) {
  for (const queryKey of keys) void queryClient.invalidateQueries({ queryKey });
  void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.rulesets.changes(rulesetId) });
}

export function itemsQuery(rulesetId: string, filters: ListFilters) {
  return infiniteQueryOptions({
    queryKey: sectionKey(rulesetId, "items", filters),
    queryFn: ({ pageParam }) =>
      parseResponse(
        rpc.api.rulesets[":id"].items.$get({
          param: { id: rulesetId },
          query: listQuery(pageParam, filters),
        }),
      ),
    initialPageParam: 1,
    getNextPageParam: nextPage,
  });
}

export function languagesQuery(rulesetId: string, filters: ListFilters) {
  return infiniteQueryOptions({
    queryKey: sectionKey(rulesetId, "languages", filters),
    queryFn: ({ pageParam }) =>
      parseResponse(
        rpc.api.rulesets[":id"].languages.$get({
          param: { id: rulesetId },
          query: listQuery(pageParam, filters),
        }),
      ),
    initialPageParam: 1,
    getNextPageParam: nextPage,
  });
}

export function mechanicsQuery(rulesetId: string, filters: ListFilters) {
  return infiniteQueryOptions({
    queryKey: sectionKey(rulesetId, "mechanics", filters),
    queryFn: ({ pageParam }) =>
      parseResponse(
        rpc.api.rulesets[":id"].mechanics.$get({
          param: { id: rulesetId },
          query: listQuery(pageParam, filters),
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
            ...listQuery(pageParam, filters),
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
 * Warm the first page of a tab the way it opens: switching tabs clears the
 * URL's filters, so that's no search, the default kind and sort, and the
 * ruleset's default "Local changes" setting.
 */
export function prefetchSection(
  queryClient: QueryClient,
  rulesetId: string,
  section: RulesetSection,
  childOnly: boolean,
) {
  const filters = { search: "", childOnly };
  switch (section) {
    case "races":
      return queryClient.prefetchInfiniteQuery(racesQuery(rulesetId, { ...filters, ...DEFAULT_ENTITY_FILTERS }));
    case "classes":
      return queryClient.prefetchInfiniteQuery(classesQuery(rulesetId, { ...filters, ...DEFAULT_ENTITY_FILTERS }));
    case "feats":
      return queryClient.prefetchInfiniteQuery(featsGroupedQuery(rulesetId, filters));
    case "powers":
      return queryClient.prefetchInfiniteQuery(powersQuery(rulesetId, filters));
    case "languages":
      return queryClient.prefetchInfiniteQuery(languagesQuery(rulesetId, filters));
    case "skills":
      return queryClient.prefetchInfiniteQuery(skillsQuery(rulesetId, filters));
    case "items":
      return queryClient.prefetchInfiniteQuery(itemsQuery(rulesetId, filters));
    case "aptitudes":
      return queryClient.prefetchInfiniteQuery(aptitudesQuery(rulesetId, filters));
    case "saves":
      return queryClient.prefetchInfiniteQuery(savesQuery(rulesetId, filters));
    case "mechanics":
      return queryClient.prefetchInfiniteQuery(mechanicsQuery(rulesetId, filters));
    case "abilities":
      return queryClient.prefetchQuery(abilitiesQuery(rulesetId, childOnly));
  }
}

export function racesQuery(rulesetId: string, filters: EntityFilters) {
  return infiniteQueryOptions({
    queryKey: [...sectionKey(rulesetId, "races", filters), filters.kind, filters.orderBy, filters.orderDir],
    queryFn: ({ pageParam }) =>
      parseResponse(
        rpc.api.rulesets[":id"].races.$get({
          param: { id: rulesetId },
          query: {
            ...listQuery(pageParam, filters),
            kind: filters.kind,
            orderBy: filters.orderBy,
            orderDir: filters.orderDir,
          },
        }),
      ),
    initialPageParam: 1,
    getNextPageParam: nextPage,
  });
}

export function savesQuery(rulesetId: string, filters: ListFilters) {
  return infiniteQueryOptions({
    queryKey: sectionKey(rulesetId, "saves", filters),
    queryFn: ({ pageParam }) =>
      parseResponse(
        rpc.api.rulesets[":id"].saves.$get({
          param: { id: rulesetId },
          query: listQuery(pageParam, filters),
        }),
      ),
    initialPageParam: 1,
    getNextPageParam: nextPage,
  });
}

export function skillsQuery(rulesetId: string, filters: ListFilters) {
  return infiniteQueryOptions({
    queryKey: sectionKey(rulesetId, "skills", filters),
    queryFn: ({ pageParam }) =>
      parseResponse(
        rpc.api.rulesets[":id"].skills.$get({
          param: { id: rulesetId },
          query: listQuery(pageParam, filters),
        }),
      ),
    initialPageParam: 1,
    getNextPageParam: nextPage,
  });
}
