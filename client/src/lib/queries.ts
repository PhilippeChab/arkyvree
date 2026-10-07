/**
 * Query definitions shared between the page that shows the data and the places that prefetch or reuse it (sidebar
 * hover, card hover, entity pages). Defining them once keeps the key and the request in step: a prefetch whose key or
 * page size drifts from the page's query is wasted, or worse, seeds the cache with pages of the wrong size.
 */

import { infiniteQueryOptions, type QueryClient, queryOptions, skipToken } from "@tanstack/react-query";
import { type InferRequestType, type InferResponseType, parseResponse } from "hono/client";

import { rpc } from "@/client/src/services/rpc.ts";

import { FOREVER } from "./durations.ts";
import { nextPage } from "./pageItems.ts";
import { QUERY_KEYS } from "./queryKeys.ts";

type ActivityListParams = InferRequestType<typeof rpc.api.activities.$get>["query"];
type CampaignListParams = InferRequestType<typeof rpc.api.campaigns.$get>["query"];
type CharacterListParams = InferRequestType<typeof rpc.api.characters.$get>["query"];
type Direction = "asc" | "desc";

type RulesetListParams = InferRequestType<typeof rpc.api.rulesets.$get>["query"];

export interface ActivityListFilters {
  orderBy: NonNullable<ActivityListParams["orderBy"]>;
  orderDir: Direction;
  search: string;
}
export type CampaignDetail = InferResponseType<(typeof rpc.api.campaigns)[":id"]["$get"], 200>;
export interface CampaignListFilters {
  orderBy: NonNullable<CampaignListParams["orderBy"]>;
  orderDir: Direction;
  search: string;
  view: "active" | "archived";
}
export type CharacterDetail = InferResponseType<(typeof rpc.api.characters)[":id"]["$get"], 200>;
export interface CharacterListFilters {
  orderBy: NonNullable<CharacterListParams["orderBy"]>;
  orderDir: Direction;
  search: string;
  view: "active" | "shared" | "archived";
}
export interface NotificationListFilters {
  orderDir: Direction;
  search: string;
  unreadOnly: boolean;
}
export type RulesetDetail = InferResponseType<(typeof rpc.api.rulesets)[":id"]["$get"], 200>;

export type RulesetItem = InferResponseType<(typeof rpc.api.rulesets)[":id"]["items"]["$get"], 200>["items"][number];

export interface RulesetListFilters {
  orderBy: NonNullable<RulesetListParams["orderBy"]>;
  orderDir: Direction;
  scope: RulesetListParams["scope"];
  search: string;
}

export type RulesetListItem = InferResponseType<typeof rpc.api.rulesets.$get, 200>["items"][number];

const LIST_PAGE_SIZE = 10;

/** The activity log, a page at a time. */
export function activityListQuery(filters: ActivityListFilters) {
  return infiniteQueryOptions({
    queryKey: QUERY_KEYS.activities.list({ ...filters }),
    queryFn: ({ pageParam }) =>
      parseResponse(
        rpc.api.activities.$get({
          query: {
            page: pageParam.toString(),
            limit: LIST_PAGE_SIZE.toString(),
            search: filters.search || undefined,
            orderBy: filters.orderBy,
            orderDir: filters.orderDir,
          },
        }),
      ),
    initialPageParam: 1,
    getNextPageParam: nextPage,
  });
}

/** Where an activity's or a notification's target is now: the server resolves its page as it's opened. */
export function activityTargetQuery(targetTable: string, targetId: string) {
  return queryOptions({
    queryKey: QUERY_KEYS.activities.target(targetTable, targetId),
    queryFn: () =>
      parseResponse(rpc.api.activities.resolve[":targetTable"][":targetId"].$get({ param: { targetTable, targetId } })),
  });
}

/** A record's attachment slot: its key and its request, which waits for the record's id. */
export function attachmentSlotQuery(recordType: string, recordId: string | undefined, name: string) {
  return queryOptions({
    queryKey: QUERY_KEYS.attachments.slot(recordType, recordId ?? "", name),
    queryFn: recordId
      ? () => parseResponse(rpc.api.attachments.$get({ query: { recordType, recordId, name } }))
      : skipToken,
  });
}

export function campaignDetailQuery(id: string) {
  return queryOptions({
    queryKey: QUERY_KEYS.campaigns.detail(id),
    queryFn: () => parseResponse(rpc.api.campaigns[":id"].$get({ param: { id } })),
  });
}

export function campaignListQuery(filters: CampaignListFilters) {
  return infiniteQueryOptions({
    queryKey: QUERY_KEYS.campaigns.list({ ...filters }),
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
    getNextPageParam: nextPage,
  });
}

export function characterDetailQuery(id: string) {
  return queryOptions({
    queryKey: QUERY_KEYS.characters.detail(id),
    queryFn: () => parseResponse(rpc.api.characters[":id"].$get({ param: { id } })),
  });
}

export function characterListQuery(filters: CharacterListFilters) {
  return infiniteQueryOptions({
    queryKey: QUERY_KEYS.characters.list({ ...filters }),
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
    getNextPageParam: nextPage,
  });
}

/** The signed-in user, as the server knows them. */
export function currentUserQuery() {
  return queryOptions({
    queryKey: QUERY_KEYS.auth.me,
    queryFn: () => parseResponse(rpc.auth.me.$get()),
  });
}

export function dashboardStatsQuery() {
  return queryOptions({
    queryKey: QUERY_KEYS.dashboard.stats,
    queryFn: () => parseResponse(rpc.api.dashboard.stats.$get()),
  });
}

/** After a write to a character's content: its sheet, and its level-up, which reads its abilities, levels and modifiers. */
export function invalidateCharacter(queryClient: QueryClient, characterId: string) {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: QUERY_KEYS.characters.detail(characterId) }),
    queryClient.invalidateQueries({ queryKey: QUERY_KEYS.characters.levelUp.all(characterId) }),
  ]);
}

/**
 * After a write a character's cards show (its name, race, levels, archive): the characters lists, and the campaigns'
 * tabs, which list it in whichever campaigns it plays.
 */
export function invalidateCharacterListings(queryClient: QueryClient) {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: QUERY_KEYS.characters.lists }),
    queryClient.invalidateQueries({ queryKey: QUERY_KEYS.campaigns.details }),
  ]);
}

/** The user's notifications, a page at a time. */
export function notificationListQuery(filters: NotificationListFilters) {
  return infiniteQueryOptions({
    queryKey: QUERY_KEYS.notifications.list({ ...filters }),
    queryFn: ({ pageParam }) =>
      parseResponse(
        rpc.api.notifications.$get({
          query: {
            page: pageParam.toString(),
            limit: LIST_PAGE_SIZE.toString(),
            search: filters.search || undefined,
            orderDir: filters.orderDir,
            unreadOnly: filters.unreadOnly ? "true" : undefined,
          },
        }),
      ),
    initialPageParam: 1,
    getNextPageParam: nextPage,
  });
}

/** The text of the Open Game License, a static file that never changes. */
export function oglLicenseQuery() {
  return queryOptions({
    queryKey: QUERY_KEYS.legal.ogl,
    queryFn: async ({ signal }) => {
      const response = await fetch("/legal/ogl-1.0a.md", { signal });
      if (!response.ok) throw new Error("Failed to load the license text");
      return response.text();
    },
    staleTime: FOREVER,
  });
}

/** The user's five latest notifications, for the dashboard. */
export function recentNotificationsQuery() {
  return queryOptions({
    queryKey: QUERY_KEYS.notifications.list({ limit: 5, page: 1 }),
    queryFn: () => parseResponse(rpc.api.notifications.$get({ query: { limit: "5", page: "1" } })),
  });
}

/** Every ability of a ruleset, for pickers and lookups: the first 100, the most one request returns. */
export function rulesetAbilitiesQuery(rulesetId: string | undefined) {
  return queryOptions({
    queryKey: QUERY_KEYS.rulesets.abilities(rulesetId ?? ""),
    queryFn: rulesetId
      ? async () => {
          const page = await parseResponse(
            rpc.api.rulesets[":id"].abilities.$get({
              param: { id: rulesetId },
              query: { page: "1", limit: "100" },
            }),
          );
          return page.items;
        }
      : skipToken,
  });
}

export function rulesetDetailQuery(id: string) {
  return queryOptions({
    queryKey: QUERY_KEYS.rulesets.detail(id),
    queryFn: () => parseResponse(rpc.api.rulesets[":id"].$get({ param: { id } })),
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

/** Every language of a ruleset, for pickers: the first 100, the most one request returns. */
export function rulesetLanguagesQuery(rulesetId: string | undefined) {
  return queryOptions({
    queryKey: QUERY_KEYS.rulesets.languages(rulesetId ?? ""),
    queryFn: rulesetId
      ? async () => {
          const page = await parseResponse(
            rpc.api.rulesets[":id"].languages.$get({
              param: { id: rulesetId },
              query: { page: "1", limit: "100" },
            }),
          );
          return page.items;
        }
      : skipToken,
  });
}

export function rulesetListQuery(filters: RulesetListFilters) {
  return infiniteQueryOptions({
    queryKey: QUERY_KEYS.rulesets.list({ ...filters }),
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
    getNextPageParam: nextPage,
  });
}

/** A ruleset picker's options: the rulesets in one scope, filtered by what's typed. */
export function rulesetPickerQuery(scope: RulesetListParams["scope"], search: string) {
  return infiniteQueryOptions({
    queryKey: QUERY_KEYS.rulesets.list({ scope, search }),
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

/** The unread notifications the bell counts and lists. */
export function unreadNotificationsQuery() {
  return queryOptions({
    queryKey: QUERY_KEYS.notifications.unreadCount,
    queryFn: () => parseResponse(rpc.api.notifications.unread.$get()),
  });
}
