import { DialogContentText } from "@mui/material";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { type InferRequestType, type InferResponseType, parseResponse } from "hono/client";

import { CreateDialog, FormTextField } from "@/client/src/components/common/index.ts";
import { useSnackbar } from "@/client/src/contexts/useSnackbar.ts";
import { useFormWith } from "@/client/src/hooks/index.ts";
import { QUERY_KEYS } from "@/client/src/lib/queryKeys.ts";
import { API_KEY_NAME_RULES } from "@/client/src/lib/validation.ts";
import { rpc } from "@/client/src/services/rpc.ts";

interface CreateApiKeyDialogProps {
  onClose: () => void;
  onCreated: (key: CreatedApiKey) => void;
  onExited: () => void;
  open: boolean;
}

/** A new key's name, as its create sends it. */
type ApiKeyFormData = InferRequestType<(typeof rpc.auth)["api-keys"]["$post"]>["json"];

/** A new key, as its create answers it: its token among its fields, shown this once. */
export type CreatedApiKey = InferResponseType<(typeof rpc.auth)["api-keys"]["$post"], 201>;

/** Makes a key named for what will use it, then hands it on to show its token. */
export function CreateApiKeyDialog({ open, onClose, onCreated, onExited }: CreateApiKeyDialogProps) {
  const snackbar = useSnackbar();
  const queryClient = useQueryClient();
  const form = useFormWith<ApiKeyFormData>({ name: "" });

  const createMutation = useMutation({
    mutationFn: (json: ApiKeyFormData) => parseResponse(rpc.auth["api-keys"].$post({ json })),
    onSuccess: (key) => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.auth.apiKeys });
      snackbar.success("API key created");
      onCreated(key);
    },
    onError: (error) => snackbar.error(error, "Failed to create API key"),
  });

  return (
    <CreateDialog
      open={open}
      onClose={onClose}
      onExited={onExited}
      title="Create New API Key"
      form={form}
      onSubmit={(data) => createMutation.mutate(data)}
      pending={createMutation.isPending}
    >
      <DialogContentText>
        A key acts as you on the public API: it reads and changes what you can. Name it for what will use it.
      </DialogContentText>
      <FormTextField
        control={form.control}
        name="name"
        label="Name"
        rules={API_KEY_NAME_RULES}
        autoFocus
        fullWidth
        disabled={createMutation.isPending}
      />
    </CreateDialog>
  );
}
