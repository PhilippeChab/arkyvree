/**
 * List queries of the campaign tabs, shared by the sections and the campaign card's hover prefetch so they use the same
 * key and request.
 */

import { infiniteQueryOptions, type QueryClient } from "@tanstack/react-query";
import { parseResponse } from "hono/client";

import { QUERY_KEYS } from "@/client/src/lib/queryKeys.ts";
import { rpc } from "@/client/src/services/rpc.ts";

export type CampaignSection = "characters" | "players";

function nextPage(lastPage: { nextPage?: number }) {
  return lastPage.nextPage;
}

export function campaignCharactersQuery(campaignId: string, search: string) {
  return infiniteQueryOptions({
    queryKey: [...QUERY_KEYS.campaigns.section(campaignId, "characters"), search],
    queryFn: ({ pageParam }) =>
      parseResponse(
        rpc.api.campaigns[":id"].characters.$get({
          param: { id: campaignId },
          query: { page: pageParam.toString(), limit: "10", search: search || undefined },
        }),
      ),
    initialPageParam: 1,
    getNextPageParam: nextPage,
  });
}

export function campaignPlayersQuery(campaignId: string, search: string) {
  return infiniteQueryOptions({
    queryKey: [...QUERY_KEYS.campaigns.section(campaignId, "players"), search],
    queryFn: ({ pageParam }) =>
      parseResponse(
        rpc.api.campaigns[":id"].players.$get({
          param: { id: campaignId },
          query: { page: pageParam.toString(), limit: "10", search: search || undefined },
        }),
      ),
    initialPageParam: 1,
    getNextPageParam: nextPage,
  });
}

/** Warm the first page of both tabs: the campaign page mounts them together. */
export function prefetchCampaignSections(queryClient: QueryClient, campaignId: string) {
  return Promise.all([
    queryClient.prefetchInfiniteQuery(campaignCharactersQuery(campaignId, "")),
    queryClient.prefetchInfiniteQuery(campaignPlayersQuery(campaignId, "")),
  ]);
}
