import { useQueries } from "@tanstack/react-query";

import { attachmentSlotQuery } from "@/client/src/lib/queries.ts";

interface UseAttachmentsParams {
  name: string;
  recordIds: string[];
  recordType: string;
}

/**
 * Per-id queries (not a single batch) so paginated callers reuse cached entries when their list grows — adding 20 ids
 * on "load more" only fetches the 20 new ones, not the whole list.
 */
export function useAttachments(params: UseAttachmentsParams) {
  const queries = useQueries({
    queries: params.recordIds.map((recordId) => attachmentSlotQuery(params.recordType, recordId, params.name)),
  });

  const data = new Map<string, string | null>();
  for (const [i, recordId] of params.recordIds.entries()) data.set(recordId, queries[i]?.data?.url ?? null);

  // `data` is a fresh Map each render. Read inline (`data.get(id)`); never
  // pass into a deps array — it would re-fire effects every render.
  return {
    data,
    isLoading: queries.some((q) => q.isLoading),
  };
}
