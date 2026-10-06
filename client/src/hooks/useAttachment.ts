import { skipToken, useQueries, useQuery } from "@tanstack/react-query";
import type { InferResponseType } from "hono/client";

import { queryKeys } from "@/client/src/lib/queryKeys.ts";
import { parseResponse, rpc } from "@/client/src/services/rpc.ts";

type AttachmentResponse = InferResponseType<typeof rpc.api.attachments.$get, 200>;

interface UseAttachmentParams {
  recordType: string;
  recordId: string | undefined;
  name: string;
  enabled?: boolean;
}

interface UseAttachmentsParams {
  recordType: string;
  name: string;
  recordIds: string[];
}

/** A record's attachment slot, as one query: its key and its request. */
function slotQuery(recordType: string, recordId: string, name: string) {
  return {
    queryKey: queryKeys.attachments.slot(recordType, recordId, name),
    queryFn: (): Promise<AttachmentResponse> =>
      parseResponse(rpc.api.attachments.$get({ query: { recordType, recordId, name } })),
  };
}

export function useAttachment(params: UseAttachmentParams) {
  const { recordId } = params;
  return useQuery({
    queryKey: queryKeys.attachments.slot(params.recordType, recordId ?? "", params.name),
    queryFn: recordId ? slotQuery(params.recordType, recordId, params.name).queryFn : skipToken,
    enabled: params.enabled ?? true,
  });
}

/**
 * Per-id queries (not a single batch) so paginated callers reuse cached entries when their list grows — adding 20 ids
 * on "load more" only fetches the 20 new ones, not the whole list.
 */
export function useAttachments(params: UseAttachmentsParams) {
  const queries = useQueries({
    queries: params.recordIds.map((recordId) => slotQuery(params.recordType, recordId, params.name)),
  });

  const data = new Map<string, string | null>();
  for (const [i, recordId] of params.recordIds.entries()) {
    data.set(recordId, queries[i]?.data?.url ?? null);
  }
  // `data` is a fresh Map each render. Read inline (`data.get(id)`); never
  // pass into a deps array — it would re-fire effects every render.
  return {
    data,
    isLoading: queries.some((q) => q.isLoading),
  };
}
