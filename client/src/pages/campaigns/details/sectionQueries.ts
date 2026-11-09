/**
 * List queries of the campaign tabs, shared by the sections and the campaign card's hover prefetch so they use the same
 * key and request: a tab's pages, and its Documents' tree whole.
 */

import { infiniteQueryOptions, type QueryClient, queryOptions, skipToken } from "@tanstack/react-query";
import { parseResponse } from "hono/client";

import { nextPage } from "@/client/src/lib/pageItems.ts";
import { QUERY_KEYS } from "@/client/src/lib/queryKeys.ts";
import { rpc } from "@/client/src/services/rpc.ts";

export type CampaignSection = "characters" | "documents" | "players";

/** A tab's search params: its page, ten rows at a time, and its search. */
function pageSearchParams(pageParam: number, search: string) {
  return { page: pageParam.toString(), limit: "10", search: search || undefined };
}

function sectionKey(campaignId: string, section: CampaignSection, search: string) {
  return [...QUERY_KEYS.campaigns.section(campaignId, section), search] as const;
}

export function campaignCharactersQuery(campaignId: string, search: string) {
  return infiniteQueryOptions({
    queryKey: sectionKey(campaignId, "characters", search),
    queryFn: ({ pageParam }) =>
      parseResponse(
        rpc.api.campaigns[":id"].characters.$get({
          param: { id: campaignId },
          query: pageSearchParams(pageParam, search),
        }),
      ),
    initialPageParam: 1,
    getNextPageParam: nextPage,
  });
}

/** A campaign's folders and documents the session sees, read whole: a campaign keeps a few hundred at most. */
export function campaignDocumentsQuery(campaignId: string) {
  return queryOptions({
    queryKey: QUERY_KEYS.campaigns.section(campaignId, "documents"),
    queryFn: () => parseResponse(rpc.api.campaigns[":id"].documents.$get({ param: { id: campaignId } })),
  });
}

export function campaignPlayersQuery(campaignId: string, search: string) {
  return infiniteQueryOptions({
    queryKey: sectionKey(campaignId, "players", search),
    queryFn: ({ pageParam }) =>
      parseResponse(
        rpc.api.campaigns[":id"].players.$get({
          param: { id: campaignId },
          query: pageSearchParams(pageParam, search),
        }),
      ),
    initialPageParam: 1,
    getNextPageParam: nextPage,
  });
}

/**
 * Every seat of a campaign, in one page of the most a request returns, which a Selected folder's or document's players
 * are picked from; skipped without a campaign (`campaignId`: none for a player, who picks none).
 */
export function campaignSeatsQuery(campaignId: string | null) {
  return queryOptions({
    queryKey: QUERY_KEYS.campaigns.seats(campaignId ?? ""),
    queryFn: campaignId
      ? () =>
          parseResponse(rpc.api.campaigns[":id"].players.$get({ param: { id: campaignId }, query: { limit: "100" } }))
      : skipToken,
  });
}

/** After a folder or a document is added, edited, moved or deleted: the Documents tab, and the item's own page. */
export function invalidateCampaignDocuments(queryClient: QueryClient, campaignId: string) {
  void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.campaigns.section(campaignId, "documents") });
}

/**
 * After a player is added, edited or removed: the campaign itself (its header counts its players), its Players tab,
 * its seats and its Documents tab (who a document names, and whom a Game Master's role shows everything to), and the
 * campaign lists, whose cards count them too. A removal unlinks the player's characters: its Characters tab with it.
 */
export function invalidateCampaignPlayers(queryClient: QueryClient, campaignId: string, removed = false) {
  void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.campaigns.detail(campaignId), exact: true });
  void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.campaigns.section(campaignId, "players") });
  void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.campaigns.seats(campaignId) });
  void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.campaigns.section(campaignId, "documents") });
  if (removed) void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.campaigns.section(campaignId, "characters") });
  void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.campaigns.lists });
}

/** Warm the first page of every tab: the campaign page mounts them together. */
export function prefetchCampaignSections(queryClient: QueryClient, campaignId: string) {
  return Promise.all([
    queryClient.prefetchInfiniteQuery(campaignCharactersQuery(campaignId, "")),
    queryClient.prefetchQuery(campaignDocumentsQuery(campaignId)),
    queryClient.prefetchInfiniteQuery(campaignPlayersQuery(campaignId, "")),
  ]);
}

/** The user's characters the Characters tab's link dialog offers, filtered by what's typed. */
export function unlinkedCharactersQuery(campaignId: string, search: string) {
  return infiniteQueryOptions({
    queryKey: QUERY_KEYS.characters.unlinked(campaignId, { search }),
    queryFn: ({ pageParam }) =>
      parseResponse(
        rpc.api.characters.unlinked[":campaignId"].$get({
          param: { campaignId },
          query: pageSearchParams(pageParam, search),
        }),
      ),
    initialPageParam: 1,
    getNextPageParam: nextPage,
  });
}
