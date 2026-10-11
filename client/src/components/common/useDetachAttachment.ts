import { useMutation, useQueryClient } from "@tanstack/react-query";
import { parseResponse } from "hono/client";

import { useSnackbar } from "@/client/src/contexts/useSnackbar.ts";
import type { AttachmentSlot } from "@/client/src/lib/queries.ts";
import { rpc } from "@/client/src/services/rpc.ts";

import { refreshAttachmentSlot } from "./refreshAttachmentSlot.ts";

export function useDetachAttachment(slot: AttachmentSlot) {
  const queryClient = useQueryClient();
  const snackbar = useSnackbar();

  return useMutation({
    mutationFn: (attachmentId: string) =>
      parseResponse(rpc.api.attachments[":id"].$delete({ param: { id: attachmentId } })),
    onSuccess: () => refreshAttachmentSlot(queryClient, slot),
    onError: (error) => snackbar.error(error, "Failed to remove attachment"),
  });
}
