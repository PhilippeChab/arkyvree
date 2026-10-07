/**
 * List queries of the ruleset tabs. Each section renders with these, and the tab bar prefetches with the same
 * factories, so a hovered tab's first page is already cached under the exact key the section asks for. The pickers the
 * ruleset's forms offer read its lists here too: its aptitudes, its feats and its saves.
 */

import {
  type DefaultError,
  infiniteQueryOptions,
  type QueryClient,
  type QueryKey,
  queryOptions,
  skipToken,
} from "@tanstack/react-query";
import { type InferRequestType, type InferResponseType, parseResponse } from "hono/client";

import { nextPage } from "@/client/src/lib/pageItems.ts";
import type { Direction } from "@/client/src/lib/queries.ts";
import { QUERY_KEYS } from "@/client/src/lib/queryKeys.ts";
import {
  DEFAULT_ENTITY_FILTERS,
  type EntityKind,
  type EntitySortField,
} from "@/client/src/pages/rulesets/hooks/dnd3.5/useEntityFilters.ts";
import { rpc } from "@/client/src/services/rpc.ts";

interface AptitudeFilters extends ListFilters {
  aptitudeId?: string;
}

type AptitudesApi = (typeof rpc.api.rulesets)[":id"]["aptitudes"];

interface EntityFilters extends ListFilters {
  kind: EntityKind;
  orderBy: EntitySortField;
  orderDir: Direction;
}

interface ListFilters {
  childOnly: boolean;
  search: string;
}

interface PowerFilters extends AptitudeFilters {
  level?: number;
}

/** A ruleset's aptitude, as its list and its pickers give it. */
export type Aptitude = InferResponseType<AptitudesApi["$get"], 200>["items"][number];

/** The aptitudes a picker offers: those of the ruleset's feats, or of its spells (all of them without one). */
export type AptitudeScope = NonNullable<InferRequestType<AptitudesApi["$get"]>["query"]["scope"]>;

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

/** A list's query where an entity's kind and its sort narrow and order it too (the races, the classes). */
function entityListQuery(pageParam: number, filters: EntityFilters) {
  return { ...listQuery(pageParam, filters), kind: filters.kind, orderBy: filters.orderBy, orderDir: filters.orderDir };
}

/** The key of a list an entity's kind and its sort narrow and order. */
function entitySectionKey(rulesetId: string, section: RulesetSection, filters: EntityFilters) {
  return [...sectionKey(rulesetId, section, filters), filters.kind, filters.orderBy, filters.orderDir] as const;
}

function listQuery(pageParam: number, { search, childOnly }: ListFilters) {
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

export function abilitiesQuery(rulesetId: string, filters: ListFilters) {
  return infiniteQueryOptions({
    queryKey: sectionKey(rulesetId, "abilities", filters),
    queryFn: ({ pageParam }) =>
      parseResponse(
        rpc.api.rulesets[":id"].abilities.$get({
          param: { id: rulesetId },
          query: listQuery(pageParam, filters),
        }),
      ),
    initialPageParam: 1,
    getNextPageParam: nextPage,
  });
}

/** A picker's aptitudes, searched on the server: a ruleset's, or those of its feats or its spells. */
export function aptitudeOptionsQuery(rulesetId: string, search: string, scope?: AptitudeScope) {
  return infiniteQueryOptions({
    queryKey: QUERY_KEYS.rulesets.sectionSearch(rulesetId, "aptitudes", search, scope),
    queryFn: async ({ pageParam }) =>
      parseResponse(
        rpc.api.rulesets[":id"].aptitudes.$get({
          param: { id: rulesetId },
          query: {
            limit: "10",
            page: pageParam.toString(),
            search: search || undefined,
            scope,
          },
        }),
      ),
    initialPageParam: 1,
    getNextPageParam: nextPage,
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
    queryKey: entitySectionKey(rulesetId, "classes", filters),
    queryFn: ({ pageParam }) =>
      parseResponse(
        rpc.api.rulesets[":id"].classes.$get({
          param: { id: rulesetId },
          query: entityListQuery(pageParam, filters),
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
      return queryClient.prefetchInfiniteQuery(abilitiesQuery(rulesetId, filters));
  }
}

export function racesQuery(rulesetId: string, filters: EntityFilters) {
  return infiniteQueryOptions({
    queryKey: entitySectionKey(rulesetId, "races", filters),
    queryFn: ({ pageParam }) =>
      parseResponse(
        rpc.api.rulesets[":id"].races.$get({
          param: { id: rulesetId },
          query: entityListQuery(pageParam, filters),
        }),
      ),
    initialPageParam: 1,
    getNextPageParam: nextPage,
  });
}

/** A feat picker's options: a ruleset's feats with their aptitudes, searched on the server, 50 a page. */
export function rulesetFeatsQuery(rulesetId: string, search: string) {
  return infiniteQueryOptions({
    queryKey: QUERY_KEYS.rulesets.sectionSearch(rulesetId, "feats", search),
    queryFn: async ({ pageParam }) =>
      parseResponse(
        rpc.api.rulesets[":id"].feats.$get({
          param: { id: rulesetId },
          query: { page: pageParam.toString(), limit: "50", search: search || undefined },
        }),
      ),
    initialPageParam: 1,
    getNextPageParam: nextPage,
  });
}

/** Every save of a ruleset, for pickers, columns and lookups: the first 100, the most one request returns. */
export function rulesetSavesQuery(rulesetId: string | undefined) {
  return queryOptions({
    queryKey: QUERY_KEYS.rulesets.saves(rulesetId ?? ""),
    queryFn: rulesetId
      ? async () => {
          const page = await parseResponse(
            rpc.api.rulesets[":id"].saves.$get({
              param: { id: rulesetId },
              query: { page: "1", limit: "100" },
            }),
          );
          return page.items;
        }
      : skipToken,
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
