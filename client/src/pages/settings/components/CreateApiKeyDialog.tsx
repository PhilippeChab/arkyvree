import { DialogContentText } from "@mui/material";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { type InferRequestType, type InferResponseType, parseResponse } from "hono/client";
import { useWatch } from "react-hook-form";

import { CreateDialog, FormTextField, SelectField } from "@/client/src/components/common/index.ts";
import { useSnackbar } from "@/client/src/contexts/useSnackbar.ts";
import { useFormWith } from "@/client/src/hooks/index.ts";
import { QUERY_KEYS } from "@/client/src/lib/queryKeys.ts";
import { API_KEY_NAME_RULES } from "@/client/src/lib/validation.ts";
import { rpc } from "@/client/src/services/rpc.ts";
import { API_KEY_LIFETIMES_IN_DAYS, DEFAULT_API_KEY_LIFETIME_IN_DAYS } from "@/shared/apiKeys.ts";

interface CreateApiKeyDialogProps {
  onClose: () => void;
  onCreated: (key: CreatedApiKey) => void;
  onExited: () => void;
  open: boolean;
}

/** A new key's form: its lifetime in days, or `""` for one that never expires, as a select's none holds it. */
type ApiKeyFormData = Omit<ApiKeyRequest, "expiresInDays"> & { expiresInDays: number | "" };

/** A new key's name and lifetime, as its create sends them. */
type ApiKeyRequest = InferRequestType<(typeof rpc.auth)["api-keys"]["$post"]>["json"];

/** A new key, as its create answers it: its token among its fields, shown this once. */
export type CreatedApiKey = InferResponseType<(typeof rpc.auth)["api-keys"]["$post"], 201>;

/** A key's lifetimes, as its form offers them: a month, three months, a year. */
const LIFETIME_OPTIONS = API_KEY_LIFETIMES_IN_DAYS.map((days) => ({
  value: days,
  label: days === 365 ? "1 Year" : `${days} Days`,
}));

/** Makes a key named for what will use it, expiring when its user chooses or never, then hands it on to show its token. */
export function CreateApiKeyDialog({ open, onClose, onCreated, onExited }: CreateApiKeyDialogProps) {
  const snackbar = useSnackbar();
  const queryClient = useQueryClient();
  const form = useFormWith<ApiKeyFormData>({ expiresInDays: DEFAULT_API_KEY_LIFETIME_IN_DAYS, name: "" });
  const neverExpires = useWatch({ control: form.control, name: "expiresInDays" }) === "";

  const createMutation = useMutation({
    mutationFn: ({ expiresInDays, name }: ApiKeyFormData) =>
      parseResponse(rpc.auth["api-keys"].$post({ json: { expiresInDays: expiresInDays || null, name } })),
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
        A key acts as you on the public API: it reads what you can. Name it for what will use it.
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
      <SelectField
        control={form.control}
        name="expiresInDays"
        label="Expiration"
        emptyLabel="No Expiration"
        options={LIFETIME_OPTIONS}
        helperText={neverExpires ? "A key that never expires works until you revoke it" : undefined}
        disabled={createMutation.isPending}
      />
    </CreateDialog>
  );
}
