import { Stack, Typography } from "@mui/material";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type InferResponseType, parseResponse } from "hono/client";

import {
  AddButton,
  BlankNote,
  ConfirmDialog,
  DataCell,
  DataRow,
  DataTable,
  DiceSpinner,
  EmptyValue,
  LoadError,
  Panel,
  PanelLead,
  ROW_ACTIONS_HOVER_SX,
  RowAction,
  RowActions,
  type TableColumn,
} from "@/client/src/components/common/index.ts";
import { RevokeIcon } from "@/client/src/components/icons/index.ts";
import { useSnackbar } from "@/client/src/contexts/useSnackbar.ts";
import { useDialogState, useIsDemo } from "@/client/src/hooks/index.ts";
import { formatDate, formatRelativeTime } from "@/client/src/lib/formatDate.ts";
import { QUERY_KEYS } from "@/client/src/lib/queryKeys.ts";
import { apiKeysQuery } from "@/client/src/pages/settings/settingsQueries.ts";
import { rpc } from "@/client/src/services/rpc.ts";
import { MAX_API_KEYS } from "@/shared/apiKeys.ts";

import { ApiKeyTokenDialog } from "./ApiKeyTokenDialog.tsx";
import { CreateApiKeyDialog, type CreatedApiKey } from "./CreateApiKeyDialog.tsx";

/** A key of the user's, as its list answers it. */
type ApiKey = InferResponseType<(typeof rpc.auth)["api-keys"]["$get"], 200>[number];

const API_KEY_COLUMNS: TableColumn[] = [
  { key: "name", label: "Name" },
  { key: "key", label: "Key" },
  { key: "expires", label: "Expires" },
  { key: "created", label: "Created" },
  { key: "lastUsed", label: "Last Used" },
  { key: "actions", label: "Actions", align: "right" },
];

/** The user's API keys, which act as them on the public API: made, listed with their last use, and revoked. */
export function ApiKeysPanel() {
  const snackbar = useSnackbar();
  const queryClient = useQueryClient();
  const { data: keys, error } = useQuery(apiKeysQuery());
  const createDialog = useDialogState();
  const tokenDialog = useDialogState<CreatedApiKey>();
  const revokeDialog = useDialogState<ApiKey>();
  // A demo's account goes when the demo ends: it makes no key
  const isDemo = useIsDemo();

  const revokeMutation = useMutation({
    mutationFn: (id: string) => parseResponse(rpc.auth["api-keys"][":id"].$delete({ param: { id } })),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.auth.apiKeys });
      snackbar.success("API key revoked");
      revokeDialog.close();
    },
    onError: (error) => snackbar.error(error, "Failed to revoke API key"),
  });

  const handleCreated = (key: CreatedApiKey) => {
    createDialog.close();
    tokenDialog.openWith(key);
  };

  return (
    <Panel spacing={3}>
      <Stack spacing={1}>
        <PanelLead
          actions={
            !isDemo && (
              <AddButton
                label="Create Key"
                disabled={(keys?.length ?? 0) >= MAX_API_KEYS}
                onClick={() => createDialog.openWith(true)}
              />
            )
          }
        >
          API Keys
        </PanelLead>
        <Typography variant="body2" sx={{ color: "text.secondary" }}>
          A key lets a program outside the app, such as a script or an assistant, read your characters and rulesets
          through the public API. It acts as you: revoke it once nothing uses it. You can keep {MAX_API_KEYS} at most.
        </Typography>
      </Stack>
      {!keys && !error && <DiceSpinner sx={{ py: 4 }} />}
      {!keys && !!error && <LoadError what="API keys" error={error} />}
      {keys?.length === 0 && <BlankNote>{isDemo ? "Sign up to create API keys" : "No API keys yet"}</BlankNote>}
      {!!keys?.length && (
        <DataTable columns={API_KEY_COLUMNS} inset={0}>
          {keys.map((key) => (
            <DataRow key={key.id} sx={ROW_ACTIONS_HOVER_SX}>
              <DataCell slot="primary">{key.name}</DataCell>
              <DataCell slot="inline" sx={{ fontFamily: "monospace" }}>
                {`${key.prefix}…`}
              </DataCell>
              <DataCell slot="labeled" label="Expires">
                {key.expiresAt ? formatDate(key.expiresAt) : "Never"}
              </DataCell>
              <DataCell slot="labeled" label="Created">
                {formatDate(key.createdAt)}
              </DataCell>
              <DataCell slot="labeled" label="Last Used">
                {key.lastUsedAt ? formatRelativeTime(key.lastUsedAt) : <EmptyValue />}
              </DataCell>
              <DataCell slot="trailing" align="right">
                <RowActions>
                  <RowAction
                    icon={RevokeIcon}
                    label="Revoke Key"
                    intent="caution"
                    onClick={() => revokeDialog.openWith(key)}
                  />
                </RowActions>
              </DataCell>
            </DataRow>
          ))}
        </DataTable>
      )}
      {createDialog.target && (
        <CreateApiKeyDialog
          key={createDialog.key}
          open={createDialog.open}
          onClose={createDialog.close}
          onCreated={handleCreated}
          onExited={createDialog.onExited}
        />
      )}
      <ApiKeyTokenDialog
        apiKey={tokenDialog.target}
        open={tokenDialog.open}
        onClose={tokenDialog.close}
        onExited={tokenDialog.onExited}
      />
      <ConfirmDialog
        open={revokeDialog.open}
        onClose={revokeDialog.close}
        onConfirm={() => revokeDialog.target && revokeMutation.mutate(revokeDialog.target.id)}
        pending={revokeMutation.isPending}
        title="Revoke API Key"
        message={`Are you sure you want to revoke ${revokeDialog.target?.name ?? "this key"}? What uses it can no longer reach the API. This action cannot be undone.`}
        confirmLabel="Revoke Key"
        intent="caution"
      />
    </Panel>
  );
}
