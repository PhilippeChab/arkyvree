import type { QueryClient } from "@tanstack/react-query";

import { type AttachmentSlot, attachmentSlotQuery } from "@/client/src/lib/queries.ts";

/** Refetches the slot's attachment once it changed. */
export function refreshAttachmentSlot(queryClient: QueryClient, slot: AttachmentSlot) {
  if (slot.recordId) void queryClient.invalidateQueries({ queryKey: attachmentSlotQuery(slot).queryKey });
}
