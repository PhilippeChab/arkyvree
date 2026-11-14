import { Stack, Typography } from "@mui/material";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { type InferResponseType, parseResponse } from "hono/client";

import {
  BlankNote,
  ConfirmDialog,
  DataCell,
  DataRow,
  DataTable,
  EmptyValue,
  ListPageResults,
  Panel,
  PanelLead,
  ROW_ACTIONS_HOVER_SX,
  RowAction,
  RowActions,
  SearchBar,
  type TableColumn,
} from "@/client/src/components/common/index.ts";
import {
  AdminIcon,
  DeactivateIcon,
  RemoveAdminIcon,
  RestoreIcon,
  VerifyEmailIcon,
} from "@/client/src/components/icons/index.ts";
import { useSnackbar } from "@/client/src/contexts/useSnackbar.ts";
import { useDialogState, useListPageQuery, useSearchText } from "@/client/src/hooks/index.ts";
import { APP_NAME } from "@/client/src/lib/brand.ts";
import { formatDate } from "@/client/src/lib/formatDate.ts";
import { QUERY_KEYS } from "@/client/src/lib/queryKeys.ts";
import { rpc } from "@/client/src/services/rpc.ts";
import { useAuthStore } from "@/client/src/stores/authStore.ts";

import { adminAccountsQuery } from "./adminQueries.ts";

/** An account of the instance, as its admins' list answers it. */
type Account = InferResponseType<typeof rpc.api.admin.accounts.$get, 200>["items"][number];

/** What an admin changes of an account, each its own request. */
type AccountChange = "admin" | "deactivate" | "reactivate" | "removeAdmin" | "verifyEmail";

const ACCOUNT_COLUMNS: TableColumn[] = [
  { key: "account", label: "Account" },
  { key: "joined", label: "Joined" },
  { key: "standing", label: "Standing" },
  { key: "actions", label: "Actions", align: "right" },
];

/** What a change answers when it's done. */
const CHANGE_MESSAGES: Record<AccountChange, string> = {
  admin: "Made an admin",
  deactivate: "Account deactivated",
  reactivate: "Account reactivated",
  removeAdmin: "No longer an admin",
  verifyEmail: "Email marked verified",
};

/** Sends an admin's change of an account (`change`): what its mutation runs. */
function accountChangeFn(id: string, change: AccountChange) {
  const account = rpc.api.admin.accounts[":id"];
  const param = { id };
  switch (change) {
    case "admin":
    case "removeAdmin":
      return parseResponse(account.admin.$put({ param, json: { isAdmin: change === "admin" } }));
    case "deactivate":
    case "reactivate":
      return parseResponse(account.deactivated.$put({ param, json: { deactivated: change === "deactivate" } }));
    case "verifyEmail":
      return parseResponse(account["verify-email"].$post({ param }));
  }
}

/** An account's standing, in words: an admin, deactivated, its email unverified. */
function describeStanding(account: Account) {
  const parts = [
    account.isAdmin && "Admin",
    account.deactivatedAt && "Deactivated",
    !account.emailVerifiedAt && "Email unverified",
  ].filter(Boolean);
  return parts.length ? parts.join(" · ") : null;
}

/**
 * The instance's accounts, searched by address or username: its admins make one an admin or no longer one, deactivate
 * or reactivate it (a deactivated one is signed out everywhere and signs in nowhere), or mark its email verified, for
 * an instance whose codes don't reach their inbox.
 */
export function AccountsPanel() {
  const snackbar = useSnackbar();
  const queryClient = useQueryClient();
  const ownId = useAuthStore((s) => s.user?.id);
  const { search, searchBarProps } = useSearchText();
  const accounts = useListPageQuery(adminAccountsQuery(search));
  const confirmDialog = useDialogState<{ account: Account; change: "deactivate" | "reactivate" }>();

  const changeMutation = useMutation({
    mutationFn: ({ account, change }: { account: Account; change: AccountChange }) =>
      accountChangeFn(account.id, change),
    onSuccess: (_, { change }) => {
      void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.admin.accountLists });
      snackbar.success(CHANGE_MESSAGES[change]);
      confirmDialog.close();
    },
    onError: (error) => snackbar.error(error, "Failed to change the account"),
  });

  const pendingFor = (account: Account, change: AccountChange) =>
    changeMutation.isPending &&
    changeMutation.variables.account.id === account.id &&
    changeMutation.variables.change === change;

  return (
    <Panel spacing={3}>
      <Stack spacing={1}>
        <PanelLead>Accounts</PanelLead>
        <Typography variant="body2" sx={{ color: "text.secondary" }}>
          Everyone with an account on this {APP_NAME}. An admin chooses who can sign up and changes these accounts. A
          deactivated account is signed out everywhere and can't sign in until it's reactivated; its characters,
          rulesets and campaigns stay as they are.
        </Typography>
      </Stack>
      <SearchBar {...searchBarProps} searchPlaceholder="Search by email or username…" />
      <ListPageResults
        list={accounts}
        what="Accounts"
        search={search}
        variant="section"
        empty={<BlankNote>No accounts yet</BlankNote>}
      >
        <DataTable columns={ACCOUNT_COLUMNS} inset={0}>
          {accounts.items.map((account) => (
            <DataRow key={account.id} sx={ROW_ACTIONS_HOVER_SX}>
              <DataCell slot="primary">
                <Stack>
                  <Typography variant="body2">{account.emailAddress}</Typography>
                  {account.username && (
                    <Typography variant="caption" sx={{ color: "text.secondary" }}>
                      {account.username}
                    </Typography>
                  )}
                </Stack>
              </DataCell>
              <DataCell slot="labeled" label="Joined">
                {formatDate(account.createdAt)}
              </DataCell>
              <DataCell slot="labeled" label="Standing">
                {describeStanding(account) ?? <EmptyValue />}
              </DataCell>
              <DataCell slot="trailing" align="right">
                <RowActions>
                  {!account.emailVerifiedAt && (
                    <RowAction
                      icon={VerifyEmailIcon}
                      label="Mark Email Verified"
                      pending={pendingFor(account, "verifyEmail")}
                      onClick={() => changeMutation.mutate({ account, change: "verifyEmail" })}
                    />
                  )}
                  <RowAction
                    icon={account.isAdmin ? RemoveAdminIcon : AdminIcon}
                    label={account.isAdmin ? "Remove Admin" : "Make Admin"}
                    pending={pendingFor(account, account.isAdmin ? "removeAdmin" : "admin")}
                    onClick={() =>
                      changeMutation.mutate({ account, change: account.isAdmin ? "removeAdmin" : "admin" })
                    }
                  />
                  {account.id !== ownId && (
                    <RowAction
                      icon={account.deactivatedAt ? RestoreIcon : DeactivateIcon}
                      label={account.deactivatedAt ? "Reactivate" : "Deactivate"}
                      intent={account.deactivatedAt ? "default" : "caution"}
                      onClick={() =>
                        confirmDialog.openWith({ account, change: account.deactivatedAt ? "reactivate" : "deactivate" })
                      }
                    />
                  )}
                </RowActions>
              </DataCell>
            </DataRow>
          ))}
        </DataTable>
      </ListPageResults>
      <ConfirmDialog
        open={confirmDialog.open}
        onClose={confirmDialog.close}
        onConfirm={() => confirmDialog.target && changeMutation.mutate(confirmDialog.target)}
        pending={changeMutation.isPending}
        title={confirmDialog.target?.change === "reactivate" ? "Reactivate Account" : "Deactivate Account"}
        message={
          confirmDialog.target?.change === "reactivate"
            ? `Are you sure you want to reactivate ${confirmDialog.target.account.emailAddress}? They'll be able to sign in again.`
            : `Are you sure you want to deactivate ${confirmDialog.target?.account.emailAddress ?? "this account"}? They'll be signed out everywhere, their API keys and connected apps cut off, and won't be able to sign in until you reactivate them. Their characters, rulesets and campaigns stay as they are.`
        }
        confirmLabel={confirmDialog.target?.change === "reactivate" ? "Reactivate" : "Deactivate"}
        intent={confirmDialog.target?.change === "reactivate" ? "positive" : "caution"}
      />
    </Panel>
  );
}
