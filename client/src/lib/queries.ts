/**
 * The queries several areas share (the sidebar's prefetches among them: the lists, the dashboard's statistics; a
 * ruleset, which its pages and a sheet's equipment read), and the refreshes a write to a character asks for. Defining
 * them once keeps the key and the request in step: a prefetch whose key or page size drifts from the page's query is
 * wasted, or worse, seeds the cache with pages of the wrong size. A query one area reads alone, its page's and its
 * prefetch's alike (a card's hover), is that area's, in its `…Queries.ts`, and so is one a single module reads
 * (`OglLicenseText`'s, `useOpenActivityTarget`'s).
 */

import { infiniteQueryOptions, type QueryClient, queryOptions, skipToken } from "@tanstack/react-query";
import { type InferRequestType, type InferResponseType, parseResponse } from "hono/client";

import { rpc } from "@/client/src/services/rpc.ts";
import { ATTACHMENT_SLOTS, type AttachmentSlotName } from "@/shared/attachments.ts";
import type { BaseRules } from "@/shared/enums.ts";

import { FOREVER } from "./durations.ts";
import { nextPage } from "./pageItems.ts";
import { QUERY_KEYS } from "./queryKeys.ts";

type CampaignListParams = InferRequestType<typeof rpc.api.campaigns.$get>["query"];
type CharacterListParams = InferRequestType<typeof rpc.api.characters.$get>["query"];

type RulesetListParams = InferRequestType<typeof rpc.api.rulesets.$get>["query"];

/** Each list of a ruleset its pickers, columns and lookups read whole, by its name: the request for its first 100. */
type RulesetOptionRequests = {
  [List in keyof RulesetOptions]: (id: string) => Promise<{ items: RulesetOptions[List] }>;
};

/** A record's attachment slot: its record (none until it has an id) and its slot (`ATTACHMENT_SLOTS`). */
export interface AttachmentSlot {
  name: AttachmentSlotName;
  recordId: string | undefined;
}

export interface CampaignListFilters {
  orderBy: NonNullable<CampaignListParams["orderBy"]>;
  orderDir: Direction;
  search: string;
  view: (typeof CAMPAIGN_VIEWS)[number];
}
export interface CharacterListFilters {
  orderBy: NonNullable<CharacterListParams["orderBy"]>;
  orderDir: Direction;
  search: string;
  view: (typeof CHARACTER_VIEWS)[number];
}
export interface RulesetListFilters {
  orderBy: NonNullable<RulesetListParams["orderBy"]>;
  orderDir: Direction;
  scope: RulesetListParams["scope"];
  search: string;
}
/** The lists of a ruleset its pickers, columns and lookups read whole (`rulesetOptionsQuery`): their rows, by name. */
export interface RulesetOptions {
  abilities: InferResponseType<(typeof rpc.api.rulesets)[":id"]["abilities"]["$get"], 200>["items"];
  saves: InferResponseType<(typeof rpc.api.rulesets)[":id"]["saves"]["$get"], 200>["items"];
}

export type CharacterDetail = InferResponseType<(typeof rpc.api.characters)[":id"]["$get"], 200>;

/** A list's sort direction, as every list endpoint takes it. */
export type Direction = NonNullable<RulesetListParams["orderDir"]>;

/** What a base rules' rulesets share: their words, the kinds a race or a class is for, their levels, their license. */
export type RulesDescription = RulesDescriptions[BaseRules];

/** What every base rules' rulesets share, by base rules. */
export type RulesDescriptions = InferResponseType<typeof rpc.api.rules.$get, 200>;

export type RulesetDetail = InferResponseType<(typeof rpc.api.rulesets)[":id"]["$get"], 200>;

export type RulesetListItem = InferResponseType<typeof rpc.api.rulesets.$get, 200>["items"][number];

/** How a base rules' classes progress, as a class's Progression and Spells tabs set it: its tracks, its spell tables. */
export type RulesProgression = RulesDescription["progression"];

/** A ruleset's words for the entity types whose word isn't the engine's, as its rules describe them. */
export type RulesWords = RulesDescription["words"];

/** A list read whole: its first page of 100, the most one request returns (a ruleset has far fewer of each). */
const FIRST_HUNDRED = { page: "1", limit: "100" };

const RULESET_OPTION_REQUESTS: RulesetOptionRequests = {
  abilities: (id) => parseResponse(rpc.api.rulesets[":id"].abilities.$get({ param: { id }, query: FIRST_HUNDRED })),
  saves: (id) => parseResponse(rpc.api.rulesets[":id"].saves.$get({ param: { id }, query: FIRST_HUNDRED })),
};

/** How the campaigns list opens: its page reads them as its URL's defaults, and the sidebar warms its first page. */
export const CAMPAIGN_LIST_DEFAULTS = {
  orderBy: "createdAt",
  orderDir: "desc",
  search: "",
  view: "active",
} as const satisfies CampaignListFilters;

/** The campaigns a list shows: the live ones, or the archived ones. */
export const CAMPAIGN_VIEWS = ["active", "archived"] as const;

/** How the characters list opens: its page reads them as its URL's defaults, and the sidebar warms its first page. */
export const CHARACTER_LIST_DEFAULTS = {
  orderBy: "lastChangedAt",
  orderDir: "desc",
  search: "",
  view: "active",
} as const satisfies CharacterListFilters;

/** The characters a list shows: the user's own live ones, those shared with them, or their archived ones. */
export const CHARACTER_VIEWS = ["active", "shared", "archived"] as const;

/** A list page's page: what a page asks for, and what its prefetch warms. */
export const LIST_PAGE_SIZE = 10;

/** How the rulesets list opens: its page reads them as its URL's defaults, and the sidebar warms its first page. */
export const RULESET_LIST_DEFAULTS = {
  orderBy: "createdAt",
  orderDir: "desc",
  scope: undefined,
  search: "",
} as const satisfies RulesetListFilters;

/** A record's attachment slot: its key and its request, which waits for the record's id. */
export function attachmentSlotQuery({ name, recordId }: AttachmentSlot) {
  const { recordType } = ATTACHMENT_SLOTS[name];
  return queryOptions({
    queryKey: QUERY_KEYS.attachments.slot(recordType, recordId ?? "", name),
    queryFn: recordId
      ? () => parseResponse(rpc.api.attachments.$get({ query: { recordType, recordId, name } }))
      : skipToken,
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
    // Refetched now, those not on screen too: the lists order by last change, and one opened later from its cache would
    // reorder its cards as it refetched
    queryClient.invalidateQueries({ queryKey: QUERY_KEYS.characters.lists, refetchType: "all" }),
    queryClient.invalidateQueries({ queryKey: QUERY_KEYS.campaigns.details }),
  ]);
}

export function rulesetDetailQuery(id: string) {
  return queryOptions({
    queryKey: QUERY_KEYS.rulesets.detail(id),
    queryFn: () => parseResponse(rpc.api.rulesets[":id"].$get({ param: { id } })),
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

/**
 * Every ability or save of a ruleset, for pickers, columns and lookups: the first 100, the most one request
 * returns, waiting for the ruleset's id.
 */
export function rulesetOptionsQuery<List extends keyof RulesetOptions>(list: List, rulesetId: string | undefined) {
  const request = RULESET_OPTION_REQUESTS[list];
  return queryOptions({
    queryKey: QUERY_KEYS.rulesets[list](rulesetId ?? ""),
    queryFn: rulesetId ? async () => (await request(rulesetId)).items : skipToken,
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

/** What every base rules' rulesets share, which changes only with the app's rules: read once, for every ruleset. */
export function rulesQuery() {
  return queryOptions({
    queryKey: QUERY_KEYS.rules,
    queryFn: () => parseResponse(rpc.api.rules.$get()),
    staleTime: FOREVER,
  });
}
