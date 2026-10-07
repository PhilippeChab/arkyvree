import { Button, IconButton, Stack, Tooltip } from "@mui/material";
import { keepPreviousData, useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { type InferRequestType, type InferResponseType, parseResponse } from "hono/client";
import { useState } from "react";

import {
  AddButton,
  BlankState,
  ConfirmDialog,
  DiceSpinner,
  EditDialog,
  LoadError,
  LoadMoreButton,
  SelectField,
} from "@/client/src/components/common/index.ts";
import {
  type ContributorRole,
  ContributorsTable,
  InviteContributorDialog,
} from "@/client/src/components/contributors/index.ts";
import { ContributorsIcon, DeleteIcon, EditIcon, LeaveIcon } from "@/client/src/components/icons/index.ts";
import { useSnackbar } from "@/client/src/contexts/useSnackbar.ts";
import { useDialogState, useFormWith } from "@/client/src/hooks/index.ts";
import { firstPage, pageItems } from "@/client/src/lib/pageItems.ts";
import type { RulesetDetail } from "@/client/src/lib/queries.ts";
import { QUERY_KEYS } from "@/client/src/lib/queryKeys.ts";
import { rulesetContributorsQuery } from "@/client/src/pages/rulesets/details/rulesetQueries.ts";
import { useRulesetPermissions } from "@/client/src/pages/rulesets/hooks/index.ts";
import { rpc } from "@/client/src/services/rpc.ts";

type Contributor = InferResponseType<(typeof rpc.api.rulesets)[":id"]["contributors"]["$get"], 200>["items"][number];
type ContributorInvite = InferRequestType<(typeof rpc.api.rulesets)[":id"]["contributors"]["$post"]>["json"];

interface ContributorsSectionProps {
  ruleset: RulesetDetail;
  onLeave?: () => void;
}

interface RoleFormData {
  role: ContributorRole;
}

export function ContributorsSection({ ruleset, onLeave }: ContributorsSectionProps) {
  const queryClient = useQueryClient();
  const snackbar = useSnackbar();
  const { isOwner, canManageContributors } = useRulesetPermissions(ruleset);
  const isArchived = ruleset.status === "Archived";
  // Invite + role-edit hit endpoints that throw on archived rulesets; gate the
  // affordances. Remove still uses canManageContributors so the owner can clean
  // up stale rows on an archived ruleset without unarchiving.
  const canInvite = canManageContributors && !isArchived;
  const canEditRoles = canManageContributors && !isArchived;
  // Only the owner may grant Admin.
  const assignableRoles: ContributorRole[] = isOwner ? ["Admin", "Editor", "Viewer"] : ["Editor", "Viewer"];

  const [inviteDialogOpen, setInviteDialogOpen] = useState(false);
  // Contributor whose role is being edited; the role itself lives in roleForm.
  const roleDialog = useDialogState<string>();
  const roleForm = useFormWith<RoleFormData>({ role: "Editor" });
  const removeDialog = useDialogState<Contributor>();
  const [leaveDialogOpen, setLeaveDialogOpen] = useState(false);

  const contributorsQuery = rulesetContributorsQuery(ruleset.id);
  const contributorsKey = contributorsQuery.queryKey;

  const { data, isLoading, error, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteQuery({
    ...contributorsQuery,
    placeholderData: keepPreviousData,
  });

  const contributors = pageItems(data);
  const owner = firstPage(data)?.owner ?? null;

  const inviteMutation = useMutation({
    mutationFn: (invite: ContributorInvite) =>
      parseResponse(rpc.api.rulesets[":id"].contributors.$post({ param: { id: ruleset.id }, json: invite })),
    onSuccess: () => {
      snackbar.success("Contributor invited");
      queryClient.invalidateQueries({ queryKey: contributorsKey });
      setInviteDialogOpen(false);
    },
    onError: (error) => snackbar.error(error, "Failed to invite contributor"),
  });

  const updateRoleMutation = useMutation({
    mutationFn: ({ contributorId, role }: { contributorId: string; role: ContributorRole }) =>
      parseResponse(
        rpc.api.rulesets[":id"].contributors[":contributorId"].$put({
          param: { id: ruleset.id, contributorId },
          json: { role },
        }),
      ),
    onSuccess: () => {
      snackbar.success("Role updated");
      queryClient.invalidateQueries({ queryKey: contributorsKey });
      roleDialog.close();
    },
    onError: (error) => snackbar.error(error, "Failed to update role"),
  });

  const revokeMutation = useMutation({
    mutationFn: (contributorId: string) =>
      parseResponse(
        rpc.api.rulesets[":id"].contributors[":contributorId"].$delete({
          param: { id: ruleset.id, contributorId },
        }),
      ),
    onSuccess: () => {
      snackbar.success("Contributor removed");
      queryClient.invalidateQueries({ queryKey: contributorsKey });
      removeDialog.close();
    },
    onError: (error) => snackbar.error(error, "Failed to remove contributor"),
  });

  const leaveMutation = useMutation({
    mutationFn: () => parseResponse(rpc.api.rulesets[":id"].contributors.leave.$post({ param: { id: ruleset.id } })),
    onSuccess: () => {
      snackbar.success("You left the ruleset");
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.rulesets.lists });
      setLeaveDialogOpen(false);
      onLeave?.();
    },
    onError: (error) => snackbar.error(error, "Failed to leave ruleset"),
  });

  if (isLoading) return <DiceSpinner sx={{ py: 4 }} />;

  if (error) return <LoadError what="Contributors" error={error} />;

  const canLeave = !isOwner && !!ruleset.contributorRole;

  return (
    <Stack spacing={2}>
      {(canLeave || canInvite) && (
        <Stack direction="row" spacing={1} sx={{ justifyContent: "flex-end" }}>
          {canLeave && (
            <Button
              variant="outlined"
              color="warning"
              size="small"
              startIcon={<LeaveIcon />}
              onClick={() => setLeaveDialogOpen(true)}
            >
              Leave
            </Button>
          )}
          {canInvite && <AddButton label="Invite" onClick={() => setInviteDialogOpen(true)} />}
        </Stack>
      )}
      {contributors.length === 0 && !owner ? (
        <BlankState
          icon={ContributorsIcon}
          title="No contributors yet"
          description={
            canInvite ? "Invite collaborators to help build this ruleset" : "This ruleset has no contributors"
          }
          action={
            canInvite ? (
              <AddButton variant="outlined" label="Invite a Contributor" onClick={() => setInviteDialogOpen(true)} />
            ) : undefined
          }
        />
      ) : (
        <Stack spacing={2}>
          <ContributorsTable
            owner={owner}
            contributors={contributors}
            showRoles
            renderActions={
              canManageContributors
                ? (contributor) => {
                    // Only the owner can change or remove an Admin.
                    const outranks = isOwner || contributor.role !== "Admin";
                    return (
                      <>
                        {canEditRoles && outranks && contributor.status === "Active" && (
                          <Tooltip title="Edit Role">
                            <IconButton
                              aria-label="Edit Role"
                              size="small"
                              onClick={() => {
                                roleForm.reset({ role: contributor.role });
                                roleDialog.openWith(contributor.id);
                              }}
                            >
                              <EditIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        )}
                        {outranks && (
                          <Tooltip title="Remove">
                            <IconButton
                              aria-label="Remove"
                              size="small"
                              color="error"
                              onClick={() => removeDialog.openWith(contributor)}
                            >
                              <DeleteIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        )}
                      </>
                    );
                  }
                : undefined
            }
          />
          <LoadMoreButton
            hasNextPage={hasNextPage}
            isFetchingNextPage={isFetchingNextPage}
            onClick={() => fetchNextPage()}
          />
        </Stack>
      )}

      <InviteContributorDialog
        open={inviteDialogOpen}
        onClose={() => setInviteDialogOpen(false)}
        onSubmit={(invite, onSent) => inviteMutation.mutate(invite, { onSuccess: onSent })}
        isLoading={inviteMutation.isPending}
        roles={assignableRoles}
      />
      <EditDialog
        open={roleDialog.open}
        onClose={roleDialog.close}
        title="Edit Role"
        form={roleForm}
        onSubmit={({ role }) =>
          roleDialog.target && updateRoleMutation.mutate({ contributorId: roleDialog.target, role })
        }
        isLoading={updateRoleMutation.isPending}
        maxWidth="xs"
      >
        <SelectField control={roleForm.control} name="role" label="Role" options={assignableRoles} />
      </EditDialog>
      <ConfirmDialog
        open={removeDialog.open}
        onClose={removeDialog.close}
        onConfirm={() => removeDialog.target && revokeMutation.mutate(removeDialog.target.id)}
        isLoading={revokeMutation.isPending}
        title="Remove Contributor"
        message={
          <>
            Are you sure you want to remove{" "}
            <strong>{removeDialog.target?.user?.username || removeDialog.target?.email}</strong> as a contributor?
          </>
        }
        confirmLabel="Remove"
        confirmColor="error"
        maxWidth="xs"
      />
      <ConfirmDialog
        open={leaveDialogOpen}
        onClose={() => setLeaveDialogOpen(false)}
        onConfirm={() => leaveMutation.mutate()}
        isLoading={leaveMutation.isPending}
        title="Leave Ruleset"
        message="Are you sure you want to leave this ruleset? You will lose access unless re-invited."
        confirmLabel="Leave"
        confirmColor="warning"
        maxWidth="xs"
      />
    </Stack>
  );
}
