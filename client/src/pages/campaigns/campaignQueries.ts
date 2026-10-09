/**
 * A campaign, which its page and its character's page read and the list's cards prefetch, and a character's sheet as
 * the campaign shows it, which the Characters tab's cards prefetch.
 */

import { queryOptions, skipToken } from "@tanstack/react-query";
import { type InferResponseType, parseResponse } from "hono/client";

import { QUERY_KEYS } from "@/client/src/lib/queryKeys.ts";
import { rpc } from "@/client/src/services/rpc.ts";

/** A campaign, as its page reads it. */
export type CampaignDetail = InferResponseType<(typeof rpc.api.campaigns)[":id"]["$get"], 200>;

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

/** A campaign: its page's and its character's page's, which the list's cards prefetch on hover. */
export function campaignDetailQuery(id: string) {
  return queryOptions({
    queryKey: QUERY_KEYS.campaigns.detail(id),
    queryFn: () => parseResponse(rpc.api.campaigns[":id"].$get({ param: { id } })),
  });
}
