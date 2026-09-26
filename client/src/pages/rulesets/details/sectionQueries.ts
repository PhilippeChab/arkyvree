/**
 * List queries of the ruleset tabs. Each section renders with these, and the
 * tab bar prefetches with the same factories, so a hovered tab's first page is
 * already cached under the exact key the section asks for.
 */
import { infiniteQueryOptions, queryOptions, type QueryClient } from "@tanstack/react-query";

import { queryKeys } from "@/client/src/lib/queryKeys.ts";
import { parseResponse, rpc } from "@/client/src/services/rpc.ts";
import { DEFAULT_ENTITY_FILTERS, type EntityKind, type EntitySortField } from "@/client/src/pages/rulesets/details/sections/kindFilterOptions.ts";

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

interface ListFilters {
  search: string;
  childOnly: boolean;
}

interface EntityFilters extends ListFilters {
  kind: EntityKind;
  orderBy: EntitySortField;
  orderDir: "asc" | "desc";
}

interface AptitudeFilters extends ListFilters {
  aptitudeId?: string;
}

interface PowerFilters extends AptitudeFilters {
  level?: number;
}

const listQuery = (pageParam: number, { search, childOnly }: ListFilters) => ({
  page: pageParam.toString(),
  limit: "10",
  search: search || undefined,
  childOnly: childOnly ? "true" as const : undefined,
});

const nextPage = (lastPage: { nextPage?: number }) => lastPage.nextPage;

const sectionKey = (rulesetId: string, section: RulesetSection, filters: ListFilters) =>
  [...queryKeys.rulesets.section(rulesetId, section), filters.search, filters.childOnly] as const;

export const languagesQuery = (rulesetId: string, filters: ListFilters) => infiniteQueryOptions({
  queryKey: sectionKey(rulesetId, "languages", filters),
  queryFn: ({ pageParam }) => parseResponse(rpc.api.rulesets[":id"].languages.$get({
    param: { id: rulesetId },
    query: listQuery(pageParam, filters),
  })),
  initialPageParam: 1,
  getNextPageParam: nextPage,
});

export const aptitudesQuery = (rulesetId: string, filters: ListFilters) => infiniteQueryOptions({
  queryKey: sectionKey(rulesetId, "aptitudes", filters),
  queryFn: ({ pageParam }) => parseResponse(rpc.api.rulesets[":id"].aptitudes.$get({
    param: { id: rulesetId },
    query: listQuery(pageParam, filters),
  })),
  initialPageParam: 1,
  getNextPageParam: nextPage,
});

export const mechanicsQuery = (rulesetId: string, filters: ListFilters) => infiniteQueryOptions({
  queryKey: sectionKey(rulesetId, "mechanics", filters),
  queryFn: ({ pageParam }) => parseResponse(rpc.api.rulesets[":id"].mechanics.$get({
    param: { id: rulesetId },
    query: listQuery(pageParam, filters),
  })),
  initialPageParam: 1,
  getNextPageParam: nextPage,
});

export const savesQuery = (rulesetId: string, filters: ListFilters) => infiniteQueryOptions({
  queryKey: sectionKey(rulesetId, "saves", filters),
  queryFn: ({ pageParam }) => parseResponse(rpc.api.rulesets[":id"].saves.$get({
    param: { id: rulesetId },
    query: listQuery(pageParam, filters),
  })),
  initialPageParam: 1,
  getNextPageParam: nextPage,
});

export const skillsQuery = (rulesetId: string, filters: ListFilters) => infiniteQueryOptions({
  queryKey: sectionKey(rulesetId, "skills", filters),
  queryFn: ({ pageParam }) => parseResponse(rpc.api.rulesets[":id"].skills.$get({
    param: { id: rulesetId },
    query: listQuery(pageParam, filters),
  })),
  initialPageParam: 1,
  getNextPageParam: nextPage,
});

export const itemsQuery = (rulesetId: string, filters: ListFilters) => infiniteQueryOptions({
  queryKey: sectionKey(rulesetId, "items", filters),
  queryFn: ({ pageParam }) => parseResponse(rpc.api.rulesets[":id"].items.$get({
    param: { id: rulesetId },
    query: listQuery(pageParam, filters),
  })),
  initialPageParam: 1,
  getNextPageParam: nextPage,
});

export const racesQuery = (rulesetId: string, filters: EntityFilters) => infiniteQueryOptions({
  queryKey: [...sectionKey(rulesetId, "races", filters), filters.kind, filters.orderBy, filters.orderDir],
  queryFn: ({ pageParam }) => parseResponse(rpc.api.rulesets[":id"].races.$get({
    param: { id: rulesetId },
    query: { ...listQuery(pageParam, filters), kind: filters.kind, orderBy: filters.orderBy, orderDir: filters.orderDir },
  })),
  initialPageParam: 1,
  getNextPageParam: nextPage,
});

export const classesQuery = (rulesetId: string, filters: EntityFilters) => infiniteQueryOptions({
  queryKey: [...sectionKey(rulesetId, "classes", filters), filters.kind, filters.orderBy, filters.orderDir],
  queryFn: ({ pageParam }) => parseResponse(rpc.api.rulesets[":id"].classes.$get({
    param: { id: rulesetId },
    query: { ...listQuery(pageParam, filters), kind: filters.kind, orderBy: filters.orderBy, orderDir: filters.orderDir },
  })),
  initialPageParam: 1,
  getNextPageParam: nextPage,
});

export const powersQuery = (rulesetId: string, filters: PowerFilters) => infiniteQueryOptions({
  queryKey: [...sectionKey(rulesetId, "powers", filters), filters.aptitudeId, filters.level],
  queryFn: ({ pageParam }) => parseResponse(rpc.api.rulesets[":id"].powers.$get({
    param: { id: rulesetId },
    query: {
      ...listQuery(pageParam, filters),
      aptitudeId: filters.aptitudeId,
      level: filters.level?.toString(),
    },
  })),
  initialPageParam: 1,
  getNextPageParam: nextPage,
});

export const featsQuery = (rulesetId: string, filters: AptitudeFilters) => infiniteQueryOptions({
  queryKey: [...sectionKey(rulesetId, "feats", filters), filters.aptitudeId],
  queryFn: ({ pageParam }) => parseResponse(rpc.api.rulesets[":id"].feats.$get({
    param: { id: rulesetId },
    query: { ...listQuery(pageParam, filters), aptitudeId: filters.aptitudeId },
  })),
  initialPageParam: 1,
  getNextPageParam: nextPage,
});

/** Feats with variant families collapsed into one row each — the Feats tab's default view. */
export const featsGroupedQuery = (rulesetId: string, filters: AptitudeFilters) => infiniteQueryOptions({
  queryKey: [...queryKeys.rulesets.sectionGrouped(rulesetId, "feats"), filters.search, filters.childOnly, filters.aptitudeId],
  queryFn: ({ pageParam }) => parseResponse(rpc.api.rulesets[":id"].feats.grouped.$get({
    param: { id: rulesetId },
    query: { ...listQuery(pageParam, filters), aptitudeId: filters.aptitudeId },
  })),
  initialPageParam: 1,
  getNextPageParam: nextPage,
});

export const abilitiesQuery = (rulesetId: string, childOnly: boolean) => queryOptions({
  queryKey: [...queryKeys.rulesets.section(rulesetId, "abilities"), childOnly],
  queryFn: () => parseResponse(rpc.api.rulesets[":id"].abilities.$get({
    param: { id: rulesetId },
    query: { page: "1", limit: "10", childOnly: childOnly ? "true" : undefined },
  })),
});

/**
 * Warm the first page of a tab the way it opens: switching tabs clears the
 * URL's filters, so that's no search, the default kind and sort, and the
 * ruleset's default "Local changes" setting.
 */
export function prefetchSection(queryClient: QueryClient, rulesetId: string, section: RulesetSection, childOnly: boolean) {
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
