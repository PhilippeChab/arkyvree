import { useQuery } from "@tanstack/react-query";

import { attachmentSlotQuery } from "@/client/src/lib/queries.ts";

interface UseAttachmentParams {
  recordType: string;
  recordId: string | undefined;
  name: string;
  enabled?: boolean;
}

export function useAttachment(params: UseAttachmentParams) {
  return useQuery({
    ...attachmentSlotQuery(params.recordType, params.recordId, params.name),
    enabled: params.enabled ?? true,
  });
}
