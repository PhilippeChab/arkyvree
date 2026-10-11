import { useMutation, useQueryClient } from "@tanstack/react-query";
import { parseResponse } from "hono/client";

import { useSnackbar } from "@/client/src/contexts/useSnackbar.ts";
import type { AttachmentSlot } from "@/client/src/lib/queries.ts";
import { rpc } from "@/client/src/services/rpc.ts";
import { ATTACHMENT_SLOTS } from "@/shared/attachments.ts";

import { refreshAttachmentSlot } from "./refreshAttachmentSlot.ts";

/**
 * Uploads a file to the slot of the record it's given, then attaches it. Its field has checked the file (its type, its
 * size) and that there's a record.
 */
export function useDirectUpload(slot: AttachmentSlot) {
  const queryClient = useQueryClient();
  const snackbar = useSnackbar();

  return useMutation({
    mutationFn: async ({ file, recordId }: { file: File; recordId: string }) => {
      const { signedId, presignedUrl, headers } = await parseResponse(
        rpc.api.attachments["direct-uploads"].$post({
          json: {
            ...ATTACHMENT_SLOTS[slot.name],
            recordId,
            filename: file.name,
            contentType: file.type,
            byteSize: file.size,
          },
        }),
      );

      // Straight to storage, outside the API client: check the status here. Its refusal says nothing a user reads, so
      // the toast says the upload failed
      const putRes = await fetch(presignedUrl, {
        method: "PUT",
        body: file,
        headers,
      });
      if (!putRes.ok) throw new Error();

      return parseResponse(rpc.api.attachments[":signedId"].attach.$post({ param: { signedId } }));
    },
    onSuccess: () => refreshAttachmentSlot(queryClient, slot),
    onError: (error) => {
      snackbar.error(error, "Failed to upload file");
    },
  });
}
