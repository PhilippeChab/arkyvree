import { useMutation, useQueryClient } from "@tanstack/react-query";

import { useSnackbar } from "@/client/src/contexts/ToastContext.tsx";
import { queryKeys } from "@/client/src/lib/queryKeys.ts";
import { parseResponse, rpc } from "@/client/src/services/rpc.ts";
import { MAX_UPLOAD_BYTES } from "@/shared/attachments.ts";

interface SlotParams {
  recordType: string;
  recordId: string | undefined;
  name: string;
}

export function useDirectUpload(slot: SlotParams) {
  const queryClient = useQueryClient();
  const snackbar = useSnackbar();

  return useMutation({
    mutationFn: async (file: File) => {
      if (!slot.recordId) throw new Error("Missing recordId");
      if (file.size > MAX_UPLOAD_BYTES) {
        throw new Error(`File exceeds ${MAX_UPLOAD_BYTES / 1024 / 1024}MB limit`);
      }

      const { signedId, presignedUrl, headers } = await parseResponse(rpc.api.attachments["direct-uploads"].$post({
        json: {
          recordType: slot.recordType,
          recordId: slot.recordId,
          name: slot.name,
          filename: file.name,
          contentType: file.type,
          byteSize: file.size,
        },
      }));

      // Straight to storage, outside the API client: check the status here.

      const putRes = await fetch(presignedUrl, {
        method: "PUT",
        body: file,
        headers,
      });
      if (!putRes.ok) {
        throw new Error(`Upload failed: ${putRes.status} ${putRes.statusText}`);
      }

      return parseResponse(rpc.api.attachments[":signedId"].attach.$post({ param: { signedId } }));
    },
    onSuccess: () => {
      if (slot.recordId) {
        queryClient.invalidateQueries({
          queryKey: queryKeys.attachments.slot(slot.recordType, slot.recordId, slot.name),
        });
      }
    },
    onError: (error) => {
      snackbar.error(error);
    },
  });
}

export function useDetachAttachment(slot: SlotParams) {
  const queryClient = useQueryClient();
  const snackbar = useSnackbar();

  return useMutation({
    mutationFn: (attachmentId: string) =>
      parseResponse(rpc.api.attachments[":id"].$delete({ param: { id: attachmentId } })),
    onSuccess: () => {
      if (slot.recordId) {
        queryClient.invalidateQueries({
          queryKey: queryKeys.attachments.slot(slot.recordType, slot.recordId, slot.name),
        });
      }
    },
    onError: (error) => snackbar.error(error),
  });
}
