import type { QueryClient } from "@tanstack/react-query";

import { QUERY_KEYS } from "@/client/src/lib/queryKeys.ts";

/** A record's attachment slot: its record and its name. */
export interface AttachmentSlot {
  recordType: string;
  recordId: string | undefined;
  name: string;
}

/** Refetches the slot's attachment once it changed. */
export function refreshAttachmentSlot(queryClient: QueryClient, slot: AttachmentSlot) {
  if (slot.recordId) {
    void queryClient.invalidateQueries({
      queryKey: QUERY_KEYS.attachments.slot(slot.recordType, slot.recordId, slot.name),
    });
  }
}
