import { useQuery } from "@tanstack/react-query";

import { attachmentSlotQuery } from "@/client/src/lib/queries.ts";

interface UseAttachmentParams {
  enabled?: boolean;
  name: string;
  recordId: string | undefined;
  recordType: string;
}

export function useAttachment(params: UseAttachmentParams) {
  return useQuery({
    ...attachmentSlotQuery(params.recordType, params.recordId, params.name),
    enabled: params.enabled ?? true,
  });
}
