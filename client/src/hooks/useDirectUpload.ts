import { useMutation, useQueryClient } from "@tanstack/react-query";

import { useSnackbar } from "@/client/src/contexts/ToastContext.tsx";
import { queryKeys } from "@/client/src/lib/queryKeys.ts";
import { ApiError, rpc } from "@/client/src/services/rpc.ts";
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

      const presignRes = await rpc.api.attachments["direct-uploads"].$post({
        json: {
          recordType: slot.recordType,
          recordId: slot.recordId,
          name: slot.name,
          filename: file.name,
          contentType: file.type,
          byteSize: file.size,
        },
      });
      if (!presignRes.ok) {
        throw new ApiError(
          "Failed to start upload",
          presignRes.status,
          "DirectUploadError",
        );
      }
      const { signedId, presignedUrl, headers } = await presignRes.json();

      const putRes = await fetch(presignedUrl, {
        method: "PUT",
        body: file,
        headers,
      });
      if (!putRes.ok) {
        throw new Error(`Upload failed: ${putRes.status} ${putRes.statusText}`);
      }

      const attachRes = await rpc.api.attachments[":signedId"].attach.$post({
        param: { signedId },
      });
      if (!attachRes.ok) {
        throw new ApiError("Failed to attach", attachRes.status, "AttachError");
      }
      return await attachRes.json();
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
    mutationFn: async (attachmentId: string) => {
      const res = await rpc.api.attachments[":id"].$delete({
        param: { id: attachmentId },
      });
      if (!res.ok) {
        throw new ApiError("Failed to detach", res.status, "DetachError");
      }
      return await res.json();
    },
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
