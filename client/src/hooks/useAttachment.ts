import { useQueries, useQuery } from "@tanstack/react-query";
import type { InferResponseType } from "hono/client";

import { queryKeys } from "@/client/src/lib/queryKeys.ts";
import { ApiError, rpc } from "@/client/src/services/rpc.ts";

export type AttachmentResponse = InferResponseType<typeof rpc.api.attachments.$get, 200>;
export type Attachment = NonNullable<AttachmentResponse>;

interface UseAttachmentParams {
  recordType: string;
  recordId: string | undefined;
  name: string;
  enabled?: boolean;
}

async function fetchSlot(
  recordType: string,
  recordId: string,
  name: string,
): Promise<AttachmentResponse> {
  const response = await rpc.api.attachments.$get({
    query: { recordType, recordId, name },
  });
  if (!response.ok) {
    throw new ApiError("Failed to load attachment", response.status, "AttachmentError");
  }
  return await response.json();
}

export function useAttachment(params: UseAttachmentParams) {
  return useQuery({
    queryKey: queryKeys.attachments.slot(
      params.recordType,
      params.recordId ?? "",
      params.name,
    ),
    queryFn: () => fetchSlot(params.recordType, params.recordId!, params.name),
    enabled: !!params.recordId && (params.enabled ?? true),
  });
}

interface UseAttachmentsParams {
  recordType: string;
  name: string;
  recordIds: string[];
}

// Per-id queries (not a single batch) so paginated callers reuse cached
// entries when their list grows — adding 20 ids on "load more" only fetches
// the 20 new ones, not the whole list.
export function useAttachments(params: UseAttachmentsParams) {
  const queries = useQueries({
    queries: params.recordIds.map((recordId) => ({
      queryKey: queryKeys.attachments.slot(params.recordType, recordId, params.name),
      queryFn: () => fetchSlot(params.recordType, recordId, params.name),
    })),
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
