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
  ListPageResults,
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
import { useDialogState, useListPageQuery } from "@/client/src/hooks/index.ts";
import { APP_NAME } from "@/client/src/lib/brand.ts";
import { formatDate } from "@/client/src/lib/formatDate.ts";
import { QUERY_KEYS } from "@/client/src/lib/queryKeys.ts";
import { rpc } from "@/client/src/services/rpc.ts";
import type { InviteLinkState } from "@/shared/inviteLinks.ts";

import { adminInviteLinksQuery, adminSettingsQuery } from "./adminQueries.ts";
import { type CreatedInviteLink, CreateInviteLinkDialog } from "./CreateInviteLinkDialog.tsx";
import { LinkCreatedDialog } from "./LinkCreatedDialog.tsx";

/** An invite link of the instance, as its admins' list answers it. */
type InviteLink = InferResponseType<(typeof rpc.api.admin)["invite-links"]["$get"], 200>["items"][number];

const INVITE_LINK_COLUMNS: TableColumn[] = [
  { key: "created", label: "Created" },
  { key: "expires", label: "Expires" },
  { key: "accounts", label: "Verified Sign-Ups" },
  { key: "state", label: "State" },
  { key: "actions", label: "Actions", align: "right" },
];

/** A link's state, in words. */
const STATE_LABELS: Record<InviteLinkState, string> = {
  Valid: "Active",
  Expired: "Expired",
  Revoked: "Revoked",
  Unknown: "Unknown",
};

/**
 * The instance's invite links: an admin makes one that lets anyone who opens it sign up for a day, a week or a month,
 * sees how many signed up with each, and revokes one. A link is shown once, as it's made.
 */
export function InviteLinksPanel() {
  const snackbar = useSnackbar();
  const queryClient = useQueryClient();
  const links = useListPageQuery(adminInviteLinksQuery());
  // The sign-up setting: a link made while it's Closed would let nobody in
  const { data: settings, error: settingsError } = useQuery(adminSettingsQuery());
  const createDialog = useDialogState();
  const createdDialog = useDialogState<CreatedInviteLink>();
  const revokeDialog = useDialogState<InviteLink>();
  const closed = settings?.signUpPolicy !== "Open" && settings?.signUpPolicy !== "Invite Only";

  const revokeMutation = useMutation({
    mutationFn: (id: string) => parseResponse(rpc.api.admin["invite-links"][":id"].revoke.$post({ param: { id } })),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.admin.inviteLinks });
      snackbar.success("Invite link revoked");
      revokeDialog.close();
    },
    onError: (error) => snackbar.error(error, "Failed to revoke the invite link"),
  });

  const handleCreated = (link: CreatedInviteLink) => {
    createDialog.close();
    createdDialog.openWith(link);
  };

  return (
    <Panel spacing={3}>
      <Stack spacing={1}>
        <PanelLead
          actions={<AddButton label="Create Link" disabled={closed} onClick={() => createDialog.openWith(true)} />}
        >
          Invite Links
        </PanelLead>
        <Typography variant="body2" sx={{ color: "text.secondary" }}>
          A link lets anyone who opens it make an account on this {APP_NAME}, even while sign-ups are Invite Only, until
          it expires or you revoke it. Links only work while sign-ups are Open or Invite Only.
        </Typography>
      </Stack>
      {!!settingsError && <LoadError what="the sign-up setting" error={settingsError} />}
      <ListPageResults
        list={links}
        what="Invite links"
        search=""
        variant="section"
        empty={<BlankNote>No invite links yet</BlankNote>}
      >
        <DataTable columns={INVITE_LINK_COLUMNS} inset={0}>
          {links.items.map((link) => (
            <DataRow key={link.id} sx={ROW_ACTIONS_HOVER_SX}>
              <DataCell slot="primary">
                <Stack>
                  <Typography variant="body2">{formatDate(link.createdAt)}</Typography>
                  <Typography variant="caption" sx={{ color: "text.secondary" }}>
                    by {link.creator ? (link.creator.username ?? link.creator.emailAddress) : "a deleted account"}
                  </Typography>
                </Stack>
              </DataCell>
              <DataCell slot="labeled" label="Expires">
                {formatDate(link.expiresAt)}
              </DataCell>
              <DataCell slot="labeled" label="Verified Sign-Ups">
                {link.accounts}
              </DataCell>
              <DataCell slot="labeled" label="State">
                {/* An active link lets nobody in while sign-ups are closed: paused until they open again */}
                {closed && link.state === "Valid" ? "Paused" : STATE_LABELS[link.state]}
              </DataCell>
              <DataCell slot="trailing" align="right">
                <RowActions>
                  {link.state === "Valid" && (
                    <RowAction
                      icon={RevokeIcon}
                      label="Revoke Link"
                      intent="caution"
                      onClick={() => revokeDialog.openWith(link)}
                    />
                  )}
                </RowActions>
              </DataCell>
            </DataRow>
          ))}
        </DataTable>
      </ListPageResults>
      {createDialog.target && (
        <CreateInviteLinkDialog
          key={createDialog.key}
          open={createDialog.open}
          onClose={createDialog.close}
          onCreated={handleCreated}
          onExited={createDialog.onExited}
        />
      )}
      <LinkCreatedDialog
        url={createdDialog.target && `${window.location.origin}/sign-up?invite=${createdDialog.target.token}`}
        title="Invite Link Created"
        label="Invite Link"
        message={`Copy this link now: it won't be shown again. It works until ${createdDialog.target ? formatDate(createdDialog.target.expiresAt) : "it expires"}, or until you revoke it.`}
        open={createdDialog.open}
        onClose={createdDialog.close}
        onExited={createdDialog.onExited}
      />
      <ConfirmDialog
        open={revokeDialog.open}
        onClose={revokeDialog.close}
        onConfirm={() => revokeDialog.target && revokeMutation.mutate(revokeDialog.target.id)}
        pending={revokeMutation.isPending}
        title="Revoke Invite Link"
        message="Are you sure you want to revoke this invite link? Nobody can sign up with it from then on; the accounts made with it stay. This action cannot be undone."
        confirmLabel="Revoke Link"
        intent="caution"
      />
    </Panel>
  );
}
