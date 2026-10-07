import { useMutation, useQueryClient } from "@tanstack/react-query";
import { parseResponse } from "hono/client";

import { useSnackbar } from "@/client/src/contexts/useSnackbar.ts";
import type { AttachmentSlot } from "@/client/src/lib/queries.ts";
import { rpc } from "@/client/src/services/rpc.ts";
import { MAX_UPLOAD_BYTES } from "@/shared/attachments.ts";

import { refreshAttachmentSlot } from "./refreshAttachmentSlot.ts";

export function useDirectUpload(slot: AttachmentSlot) {
  const queryClient = useQueryClient();
  const snackbar = useSnackbar();

  return useMutation({
    mutationFn: async (file: File) => {
      if (!slot.recordId) throw new Error("Missing recordId");
      if (file.size > MAX_UPLOAD_BYTES) throw new Error(`File exceeds ${MAX_UPLOAD_BYTES / 1024 / 1024}MB limit`);

      const { signedId, presignedUrl, headers } = await parseResponse(
        rpc.api.attachments["direct-uploads"].$post({
          json: {
            recordType: slot.recordType,
            recordId: slot.recordId,
            name: slot.name,
            filename: file.name,
            contentType: file.type,
            byteSize: file.size,
          },
        }),
      );

      // Straight to storage, outside the API client: check the status here.
      const putRes = await fetch(presignedUrl, {
        method: "PUT",
        body: file,
        headers,
      });
      if (!putRes.ok) throw new Error(`Upload failed: ${putRes.status} ${putRes.statusText}`);

      return parseResponse(rpc.api.attachments[":signedId"].attach.$post({ param: { signedId } }));
    },
    onSuccess: () => refreshAttachmentSlot(queryClient, slot),
    onError: (error) => {
      snackbar.error(error, "Failed to upload file");
    },
  });
}
