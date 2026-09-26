/**
 * Query definitions shared between the page that shows the data and the
 * places that prefetch or reuse it (sidebar hover, card hover, entity pages).
 * Defining them once keeps the key and the request in step: a prefetch whose
 * key or page size drifts from the page's query is wasted, or worse, seeds the
 * cache with pages of the wrong size.
 */
import { infiniteQueryOptions, queryOptions } from "@tanstack/react-query";
import type { InferRequestType } from "hono/client";

import { queryKeys } from "@/client/src/lib/queryKeys.ts";
import { parseResponse, rpc } from "@/client/src/services/rpc.ts";

export const LIST_PAGE_SIZE = 10;

type CampaignListParams = InferRequestType<typeof rpc.api.campaigns.$get>["query"];
type CharacterListParams = InferRequestType<typeof rpc.api.characters.$get>["query"];
type RulesetListParams = InferRequestType<typeof rpc.api.rulesets.$get>["query"];

type Direction = "asc" | "desc";

export const dashboardStatsQuery = () => queryOptions({
  queryKey: queryKeys.dashboard.stats,
  queryFn: () => parseResponse(rpc.api.dashboard.stats.$get()),
});

export interface CampaignListFilters {
  view: "active" | "archived";
  search: string;
  orderBy: NonNullable<CampaignListParams["orderBy"]>;
  orderDir: Direction;
}

export const campaignListQuery = (filters: CampaignListFilters) => infiniteQueryOptions({
  queryKey: queryKeys.campaigns.list({ ...filters }),
  queryFn: ({ pageParam }) => parseResponse(rpc.api.campaigns.$get({
    query: {
      page: pageParam.toString(),
      limit: LIST_PAGE_SIZE.toString(),
      visibility: filters.view,
      search: filters.search || undefined,
      orderBy: filters.orderBy,
      orderDir: filters.orderDir,
    },
  })),
  initialPageParam: 1,
  getNextPageParam: (lastPage) => lastPage.nextPage,
});

export interface CharacterListFilters {
  view: "active" | "shared" | "archived";
  search: string;
  orderBy: NonNullable<CharacterListParams["orderBy"]>;
  orderDir: Direction;
}

export const characterListQuery = (filters: CharacterListFilters) => infiniteQueryOptions({
  queryKey: queryKeys.characters.list({ ...filters }),
  queryFn: ({ pageParam }) => parseResponse(rpc.api.characters.$get({
    query: {
      page: pageParam.toString(),
      limit: LIST_PAGE_SIZE.toString(),
      // "Shared" lists active characters the user contributes to.
      visibility: filters.view === "archived" ? "archived" : "active",
      accessRole: filters.view === "shared" ? "contributor" : undefined,
      search: filters.search || undefined,
      orderBy: filters.orderBy,
      orderDir: filters.orderDir,
    },
  })),
  initialPageParam: 1,
  getNextPageParam: (lastPage) => lastPage.nextPage,
});

export interface RulesetListFilters {
  scope: RulesetListParams["scope"];
  search: string;
  orderBy: NonNullable<RulesetListParams["orderBy"]>;
  orderDir: Direction;
}

export const rulesetListQuery = (filters: RulesetListFilters) => infiniteQueryOptions({
  queryKey: queryKeys.rulesets.list({ ...filters }),
  queryFn: ({ pageParam }) => parseResponse(rpc.api.rulesets.$get({
    query: {
      page: pageParam.toString(),
      limit: LIST_PAGE_SIZE.toString(),
      scope: filters.scope,
      search: filters.search || undefined,
      orderBy: filters.orderBy,
      orderDir: filters.orderDir,
    },
  })),
  initialPageParam: 1,
  getNextPageParam: (lastPage) => lastPage.nextPage,
});

export const rulesetDetailQuery = (id: string) => queryOptions({
  queryKey: queryKeys.rulesets.detail(id),
  queryFn: () => parseResponse(rpc.api.rulesets[":id"].$get({ param: { id } })),
});

export const campaignDetailQuery = (id: string) => queryOptions({
  queryKey: queryKeys.campaigns.detail(id),
  queryFn: () => parseResponse(rpc.api.campaigns[":id"].$get({ param: { id } })),
});

export const characterDetailQuery = (id: string) => queryOptions({
  queryKey: queryKeys.characters.detail(id),
  queryFn: () => parseResponse(rpc.api.characters[":id"].$get({ param: { id } })),
});
