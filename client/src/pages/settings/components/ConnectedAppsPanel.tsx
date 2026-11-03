import { Stack, Typography } from "@mui/material";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type InferResponseType, parseResponse } from "hono/client";

import {
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
import { useDialogState } from "@/client/src/hooks/index.ts";
import { APP_NAME } from "@/client/src/lib/brand.ts";
import { formatDate, formatRelativeTime } from "@/client/src/lib/formatDate.ts";
import { QUERY_KEYS } from "@/client/src/lib/queryKeys.ts";
import { rpc } from "@/client/src/services/rpc.ts";

import { connectedAppsQuery } from "./connectedAppsQueries.ts";

/** An app the user connected, as its list answers it. */
type ConnectedApp = InferResponseType<(typeof rpc.auth)["connected-apps"]["$get"], 200>[number];

const CONNECTED_APP_COLUMNS: TableColumn[] = [
  { key: "name", label: "App" },
  { key: "site", label: "Site" },
  { key: "access", label: "Access" },
  { key: "connected", label: "Connected" },
  { key: "lastUsed", label: "Last Used" },
  { key: "actions", label: "Actions", align: "right" },
];

/**
 * The apps the user connected to Arkyvree's MCP server (Claude, ChatGPT), each signed in as them on its consent page:
 * listed with their access and last use, and disconnected.
 */
export function ConnectedAppsPanel() {
  const snackbar = useSnackbar();
  const queryClient = useQueryClient();
  const { data: apps, error } = useQuery(connectedAppsQuery());
  const disconnectDialog = useDialogState<ConnectedApp>();

  const disconnectMutation = useMutation({
    mutationFn: (id: string) => parseResponse(rpc.auth["connected-apps"][":id"].$delete({ param: { id } })),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.auth.connectedApps });
      snackbar.success("App disconnected");
      disconnectDialog.close();
    },
    onError: (error) => snackbar.error(error, "Failed to disconnect the app"),
  });

  return (
    <Panel spacing={3}>
      <Stack spacing={1}>
        <PanelLead>Connected Apps</PanelLead>
        <Typography variant="body2" sx={{ color: "text.secondary" }}>
          Assistants you connected to {APP_NAME}, such as Claude or ChatGPT. Each acts as you, reading only when you
          chose Read Only: disconnect one you no longer use.
        </Typography>
      </Stack>
      {!apps && !error && <DiceSpinner sx={{ py: 4 }} />}
      {!apps && !!error && <LoadError what="connected apps" error={error} />}
      {apps?.length === 0 && <BlankNote>No connected apps yet</BlankNote>}
      {!!apps?.length && (
        <DataTable columns={CONNECTED_APP_COLUMNS} inset={0}>
          {apps.map((app) => (
            <DataRow key={app.id} sx={ROW_ACTIONS_HOVER_SX}>
              <DataCell slot="primary">{app.clientName}</DataCell>
              <DataCell slot="inline">{app.clientHost}</DataCell>
              <DataCell slot="labeled" label="Access">
                {app.readOnly ? "Read Only" : "Read and Change"}
              </DataCell>
              <DataCell slot="labeled" label="Connected">
                {formatDate(app.createdAt)}
              </DataCell>
              <DataCell slot="labeled" label="Last Used">
                {app.lastUsedAt ? formatRelativeTime(app.lastUsedAt) : <EmptyValue />}
              </DataCell>
              <DataCell slot="trailing" align="right">
                <RowActions>
                  <RowAction
                    icon={RevokeIcon}
                    label="Disconnect App"
                    intent="caution"
                    onClick={() => disconnectDialog.openWith(app)}
                  />
                </RowActions>
              </DataCell>
            </DataRow>
          ))}
        </DataTable>
      )}
      <ConfirmDialog
        open={disconnectDialog.open}
        onClose={disconnectDialog.close}
        onConfirm={() => disconnectDialog.target && disconnectMutation.mutate(disconnectDialog.target.id)}
        pending={disconnectMutation.isPending}
        title="Disconnect App"
        message={`Are you sure you want to disconnect ${disconnectDialog.target?.clientName ?? "this app"}? It can no longer reach your account until you connect it again.`}
        confirmLabel="Disconnect"
        intent="caution"
      />
    </Panel>
  );
}
