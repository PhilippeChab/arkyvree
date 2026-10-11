import { useQuery } from "@tanstack/react-query";

import { type AttachmentSlot, attachmentSlotQuery } from "@/client/src/lib/queries.ts";

interface UseAttachmentParams extends AttachmentSlot {
  enabled?: boolean;
}

export function useAttachment({ enabled = true, ...slot }: UseAttachmentParams) {
  return useQuery({ ...attachmentSlotQuery(slot), enabled });
}
