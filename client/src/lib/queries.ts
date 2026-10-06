/**
 * Query definitions shared between the page that shows the data and the places that prefetch or reuse it (sidebar
 * hover, card hover, entity pages). Defining them once keeps the key and the request in step: a prefetch whose key or
 * page size drifts from the page's query is wasted, or worse, seeds the cache with pages of the wrong size.
 */

import { infiniteQueryOptions, queryOptions } from "@tanstack/react-query";
import type { InferRequestType, InferResponseType } from "hono/client";
import { parseResponse } from "hono/client";

import { queryKeys } from "@/client/src/lib/queryKeys.ts";
import { rpc } from "@/client/src/services/rpc.ts";

type CampaignListParams = InferRequestType<typeof rpc.api.campaigns.$get>["query"];
type CharacterListParams = InferRequestType<typeof rpc.api.characters.$get>["query"];
type Direction = "asc" | "desc";

type RulesetListParams = InferRequestType<typeof rpc.api.rulesets.$get>["query"];

export type CampaignDetail = InferResponseType<(typeof rpc.api.campaigns)[":id"]["$get"], 200>;
export interface CampaignListFilters {
  view: "active" | "archived";
  search: string;
  orderBy: NonNullable<CampaignListParams["orderBy"]>;
  orderDir: Direction;
}
export type CharacterDetail = InferResponseType<(typeof rpc.api.characters)[":id"]["$get"], 200>;
export interface CharacterListFilters {
  view: "active" | "shared" | "archived";
  search: string;
  orderBy: NonNullable<CharacterListParams["orderBy"]>;
  orderDir: Direction;
}
export type RulesetDetail = InferResponseType<(typeof rpc.api.rulesets)[":id"]["$get"], 200>;

export type RulesetItem = InferResponseType<(typeof rpc.api.rulesets)[":id"]["items"]["$get"], 200>["items"][number];

export interface RulesetListFilters {
  scope: RulesetListParams["scope"];
  search: string;
  orderBy: NonNullable<RulesetListParams["orderBy"]>;
  orderDir: Direction;
}

export type RulesetListItem = InferResponseType<typeof rpc.api.rulesets.$get, 200>["items"][number];

const LIST_PAGE_SIZE = 10;

export function campaignDetailQuery(id: string) {
  return queryOptions({
    queryKey: queryKeys.campaigns.detail(id),
    queryFn: () => parseResponse(rpc.api.campaigns[":id"].$get({ param: { id } })),
  });
}

export function campaignListQuery(filters: CampaignListFilters) {
  return infiniteQueryOptions({
    queryKey: queryKeys.campaigns.list({ ...filters }),
    queryFn: ({ pageParam }) =>
      parseResponse(
        rpc.api.campaigns.$get({
          query: {
            page: pageParam.toString(),
            limit: LIST_PAGE_SIZE.toString(),
            visibility: filters.view,
            search: filters.search || undefined,
            orderBy: filters.orderBy,
            orderDir: filters.orderDir,
          },
        }),
      ),
    initialPageParam: 1,
    getNextPageParam: (lastPage) => lastPage.nextPage,
  });
}

export function characterDetailQuery(id: string) {
  return queryOptions({
    queryKey: queryKeys.characters.detail(id),
    queryFn: () => parseResponse(rpc.api.characters[":id"].$get({ param: { id } })),
  });
}

export function characterListQuery(filters: CharacterListFilters) {
  return infiniteQueryOptions({
    queryKey: queryKeys.characters.list({ ...filters }),
    queryFn: ({ pageParam }) =>
      parseResponse(
        rpc.api.characters.$get({
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
        }),
      ),
    initialPageParam: 1,
    getNextPageParam: (lastPage) => lastPage.nextPage,
  });
}

export function dashboardStatsQuery() {
  return queryOptions({
    queryKey: queryKeys.dashboard.stats,
    queryFn: () => parseResponse(rpc.api.dashboard.stats.$get()),
  });
}

export function rulesetDetailQuery(id: string) {
  return queryOptions({
    queryKey: queryKeys.rulesets.detail(id),
    queryFn: () => parseResponse(rpc.api.rulesets[":id"].$get({ param: { id } })),
  });
}

export function rulesetListQuery(filters: RulesetListFilters) {
  return infiniteQueryOptions({
    queryKey: queryKeys.rulesets.list({ ...filters }),
    queryFn: ({ pageParam }) =>
      parseResponse(
        rpc.api.rulesets.$get({
          query: {
            page: pageParam.toString(),
            limit: LIST_PAGE_SIZE.toString(),
            scope: filters.scope,
            search: filters.search || undefined,
            orderBy: filters.orderBy,
            orderDir: filters.orderDir,
          },
        }),
      ),
    initialPageParam: 1,
    getNextPageParam: (lastPage) => lastPage.nextPage,
  });
}

/** A ruleset picker's options: the rulesets in one scope, filtered by what's typed. */
export function rulesetPickerQuery(scope: RulesetListParams["scope"], search: string) {
  return infiniteQueryOptions({
    queryKey: queryKeys.rulesets.list({ scope, search }),
    queryFn: ({ pageParam }) =>
      parseResponse(
        rpc.api.rulesets.$get({
          query: {
            page: pageParam.toString(),
            limit: LIST_PAGE_SIZE.toString(),
            scope,
            search: search || undefined,
          },
        }),
      ),
    initialPageParam: 1,
    getNextPageParam: (lastPage) => lastPage.nextPage,
  });
}
