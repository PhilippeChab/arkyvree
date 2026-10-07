/**
 * Queries of a campaign's characters: a character's sheet as the campaign shows it, which the Characters tab's cards
 * prefetch, and the characters the link dialog offers.
 */

import { infiniteQueryOptions, queryOptions, skipToken } from "@tanstack/react-query";
import { parseResponse } from "hono/client";

import { QUERY_KEYS } from "@/client/src/lib/queryKeys.ts";
import { rpc } from "@/client/src/services/rpc.ts";

/** A character's sheet as the campaign shows its members; skipped while either id is missing. */
export function campaignCharacterQuery(campaignId: string, characterId: string) {
  return queryOptions({
    queryKey: QUERY_KEYS.campaigns.characterDetail(campaignId, characterId),
    queryFn:
      campaignId && characterId
        ? () =>
            parseResponse(
              rpc.api.campaigns[":id"].characters[":characterId"].$get({ param: { id: campaignId, characterId } }),
            )
        : skipToken,
  });
}

/** The user's characters a campaign can link, filtered by what's typed. */
export function unlinkedCharactersQuery(campaignId: string, search: string) {
  return infiniteQueryOptions({
    queryKey: QUERY_KEYS.characters.unlinked(campaignId, { search }),
    queryFn: ({ pageParam }) =>
      parseResponse(
        rpc.api.characters.unlinked[":campaignId"].$get({
          param: { campaignId },
          query: { limit: "10", page: pageParam.toString(), search: search || undefined },
        }),
      ),
    initialPageParam: 1,
    getNextPageParam: (lastPage) => lastPage.nextPage,
  });
}
