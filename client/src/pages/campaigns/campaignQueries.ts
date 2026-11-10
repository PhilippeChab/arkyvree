/**
 * A campaign, which its page and its character's page read and the list's cards prefetch, a character's sheet as the
 * campaign shows it, which the Characters tab's cards prefetch, and a folder, a document or a note, which its page
 * reads, with a document's text file's words.
 */

import { queryOptions, skipToken } from "@tanstack/react-query";
import { type InferResponseType, parseResponse } from "hono/client";

import { QUERY_KEYS } from "@/client/src/lib/queryKeys.ts";
import { rpc } from "@/client/src/services/rpc.ts";

import { readDocumentTextFn } from "./details/sections/documentFiles.ts";
import { type DocumentFile, MAX_SHOWN_TEXT_BYTES, readFileKind } from "./details/sections/documents.ts";

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

/** A folder or a document of a campaign, as the session sees it, with a document's text; skipped while an id is missing. */
export function campaignDocumentQuery(campaignId: string, documentId: string) {
  return queryOptions({
    queryKey: QUERY_KEYS.campaigns.documentDetail(campaignId, documentId),
    queryFn:
      campaignId && documentId
        ? () =>
            parseResponse(
              rpc.api.campaigns[":id"].documents[":documentId"].$get({ param: { id: campaignId, documentId } }),
            )
        : skipToken,
  });
}

/**
 * A document's text file's words, which its page shows in place: read anew once the file is replaced (`uploadedAt`),
 * and only for a text file small enough to show (`MAX_SHOWN_TEXT_BYTES`): a larger one opens in its own tab.
 */
export function campaignDocumentTextQuery(campaignId: string, documentId: string, file: DocumentFile) {
  return queryOptions({
    queryKey: [...QUERY_KEYS.campaigns.documentDetail(campaignId, documentId), "text", file.uploadedAt],
    queryFn: () => readDocumentTextFn(campaignId, documentId),
    enabled: readFileKind(file) === "Text" && file.byteSize <= MAX_SHOWN_TEXT_BYTES,
  });
}
