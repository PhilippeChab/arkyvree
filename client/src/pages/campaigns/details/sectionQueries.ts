/**
 * List queries of the campaign tabs, shared by the sections and the prefetches
 * (tab hover, campaign card hover) so they use the same key and request.
 */
import { infiniteQueryOptions, type QueryClient } from "@tanstack/react-query";

import { queryKeys } from "@/client/src/lib/queryKeys.ts";
import { parseResponse, rpc } from "@/client/src/services/rpc.ts";

export type CampaignSection = "characters" | "players";

const nextPage = (lastPage: { nextPage?: number }) => lastPage.nextPage;

export const campaignCharactersQuery = (campaignId: string, search: string) => infiniteQueryOptions({
  queryKey: [...queryKeys.campaigns.section(campaignId, "characters"), search],
  queryFn: ({ pageParam }) => parseResponse(rpc.api.campaigns[":id"].characters.$get({
    param: { id: campaignId },
    query: { page: pageParam.toString(), limit: "10", search: search || undefined },
  })),
  initialPageParam: 1,
  getNextPageParam: nextPage,
});

export const campaignPlayersQuery = (campaignId: string, search: string) => infiniteQueryOptions({
  queryKey: [...queryKeys.campaigns.section(campaignId, "players"), search],
  queryFn: ({ pageParam }) => parseResponse(rpc.api.campaigns[":id"].players.$get({
    param: { id: campaignId },
    query: { page: pageParam.toString(), limit: "10", search: search || undefined },
  })),
  initialPageParam: 1,
  getNextPageParam: nextPage,
});

/** Warm the first page of a tab as it opens: tab changes clear the search. */
export function prefetchCampaignSection(queryClient: QueryClient, campaignId: string, section: CampaignSection) {
  return section === "characters"
    ? queryClient.prefetchInfiniteQuery(campaignCharactersQuery(campaignId, ""))
    : queryClient.prefetchInfiniteQuery(campaignPlayersQuery(campaignId, ""));
}
