import { Box, Button, Stack } from "@mui/material";
import { keepPreviousData, useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { InferRequestType, InferResponseType } from "hono/client";
import { useState } from "react";

import {
  ConfirmDialog,
  DiceSpinner,
  EditDialog,
  LoadError,
  LoadMoreButton,
  type RowAction,
  SelectField,
} from "@/client/src/components/common/index.ts";
import {
  type ContributorRole,
  ContributorsTable,
  InviteContributorDialog,
} from "@/client/src/components/contributors/index.ts";
import { AddIcon, ContributorsIcon, DeleteIcon, EditIcon, LeaveIcon } from "@/client/src/components/icons/index.ts";
import { useSnackbar } from "@/client/src/contexts/useSnackbar.ts";
import { useFormWith } from "@/client/src/hooks/index.ts";
import { pageItems } from "@/client/src/lib/pageItems.ts";
import type { RulesetDetail } from "@/client/src/lib/queries.ts";
import { queryKeys } from "@/client/src/lib/queryKeys.ts";
import { useRulesetPermissions } from "@/client/src/pages/rulesets/hooks/index.ts";
import { parseResponse, rpc } from "@/client/src/services/rpc.ts";

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
  const [roleTargetId, setRoleTargetId] = useState<string | null>(null);
  const roleForm = useFormWith<RoleFormData>({ role: "Editor" });
  const [removeTarget, setRemoveTarget] = useState<Contributor | null>(null);
  const [leaveDialogOpen, setLeaveDialogOpen] = useState(false);

  const contributorsKey = queryKeys.rulesets.section(ruleset.id, "contributors");

  const { data, isLoading, error, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteQuery({
    queryKey: contributorsKey,
    queryFn: ({ pageParam }) =>
      parseResponse(
        rpc.api.rulesets[":id"].contributors.$get({
          param: { id: ruleset.id },
          query: { page: pageParam.toString(), limit: "10" },
        }),
      ),
    initialPageParam: 1,
    getNextPageParam: (lastPage) => lastPage.nextPage,
    placeholderData: keepPreviousData,
  });

  const contributors = pageItems(data);
  const owner = data?.pages[0]?.owner ?? null;

  const inviteMutation = useMutation({
    mutationFn: (invite: ContributorInvite) =>
      rpc.api.rulesets[":id"].contributors.$post({ param: { id: ruleset.id }, json: invite }),
    onSuccess: () => {
      snackbar.success("Contributor invited");
      queryClient.invalidateQueries({ queryKey: contributorsKey });
      setInviteDialogOpen(false);
    },
    onError: (error) => snackbar.error(error, "Failed to invite contributor"),
  });

  const updateRoleMutation = useMutation({
    mutationFn: ({ contributorId, role }: { contributorId: string; role: ContributorRole }) =>
      rpc.api.rulesets[":id"].contributors[":contributorId"].$put({
        param: { id: ruleset.id, contributorId },
        json: { role },
      }),
    onSuccess: () => {
      snackbar.success("Role updated");
      queryClient.invalidateQueries({ queryKey: contributorsKey });
      setRoleTargetId(null);
    },
    onError: (error) => snackbar.error(error, "Failed to update role"),
  });

  const revokeMutation = useMutation({
    mutationFn: (contributorId: string) =>
      rpc.api.rulesets[":id"].contributors[":contributorId"].$delete({
        param: { id: ruleset.id, contributorId },
      }),
    onSuccess: () => {
      snackbar.success("Contributor removed");
      queryClient.invalidateQueries({ queryKey: contributorsKey });
      setRemoveTarget(null);
    },
    onError: (error) => snackbar.error(error, "Failed to remove contributor"),
  });

  const leaveMutation = useMutation({
    mutationFn: () => rpc.api.rulesets[":id"].contributors.leave.$post({ param: { id: ruleset.id } }),
    onSuccess: () => {
      snackbar.success("You left the ruleset");
      queryClient.invalidateQueries({ queryKey: queryKeys.rulesets.lists });
      setLeaveDialogOpen(false);
      onLeave?.();
    },
    onError: (error) => snackbar.error(error, "Failed to leave ruleset"),
  });

  if (isLoading) {
    return <DiceSpinner sx={{ py: 4 }} />;
  }

  if (error) {
    return <LoadError what="Contributors" error={error} />;
  }

  const canLeave = !isOwner && !!ruleset.contributorRole;

  return (
    <Box>
      {(canLeave || canInvite) && (
        <Stack direction="row" spacing={1} sx={{ justifyContent: "flex-end", mb: 2 }}>
          {canLeave && (
            <Button
              variant="contained"
              color="warning"
              size="small"
              startIcon={<LeaveIcon />}
              onClick={() => setLeaveDialogOpen(true)}
            >
              Leave
            </Button>
          )}
          {canInvite && (
            <Button variant="contained" startIcon={<AddIcon />} onClick={() => setInviteDialogOpen(true)}>
              Invite
            </Button>
          )}
        </Stack>
      )}
      <ContributorsTable
        owner={owner}
        contributors={contributors}
        showRoles
        actions={
          canManageContributors
            ? (contributor) => {
                // Only the owner can change or remove an Admin.
                const outranks = isOwner || contributor.role !== "Admin";
                const actions: RowAction[] = [];
                if (canEditRoles && outranks && contributor.status === "Active") {
                  actions.push({
                    label: "Edit role",
                    icon: <EditIcon fontSize="small" />,
                    onClick: () => {
                      roleForm.reset({ role: contributor.role });
                      setRoleTargetId(contributor.id);
                    },
                  });
                }
                if (outranks) {
                  actions.push({
                    label: "Remove",
                    icon: <DeleteIcon fontSize="small" />,
                    onClick: () => setRemoveTarget(contributor),
                    color: "error",
                  });
                }
                return actions;
              }
            : undefined
        }
        empty={{
          icon: ContributorsIcon,
          title: "No contributors yet",
          description: canInvite
            ? "Invite collaborators to help build this ruleset"
            : "This ruleset has no contributors",
          action: canInvite ? (
            <Button variant="outlined" startIcon={<AddIcon />} onClick={() => setInviteDialogOpen(true)}>
              Invite a Contributor
            </Button>
          ) : undefined,
        }}
      />
      <LoadMoreButton
        hasNextPage={hasNextPage}
        isFetchingNextPage={isFetchingNextPage}
        onClick={() => fetchNextPage()}
      />

      <InviteContributorDialog
        open={inviteDialogOpen}
        onClose={() => setInviteDialogOpen(false)}
        onSubmit={(invite, onSent) => inviteMutation.mutate(invite, { onSuccess: onSent })}
        isLoading={inviteMutation.isPending}
        roles={assignableRoles}
      />
      <EditDialog
        open={!!roleTargetId}
        onClose={() => setRoleTargetId(null)}
        title="Update Role"
        form={roleForm}
        onSubmit={({ role }) => roleTargetId && updateRoleMutation.mutate({ contributorId: roleTargetId, role })}
        isLoading={updateRoleMutation.isPending}
        submitLabel="Save"
        maxWidth="xs"
      >
        <SelectField control={roleForm.control} name="role" label="Role" options={assignableRoles} />
      </EditDialog>
      {removeTarget && (
        <ConfirmDialog
          open
          onClose={() => setRemoveTarget(null)}
          onConfirm={() => revokeMutation.mutate(removeTarget.id)}
          isLoading={revokeMutation.isPending}
          title="Remove Contributor"
          message={
            <>
              Are you sure you want to remove <strong>{removeTarget.user?.username || removeTarget.email}</strong> as a
              contributor?
            </>
          }
          confirmLabel="Remove"
          confirmColor="error"
          maxWidth="xs"
        />
      )}
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
    </Box>
  );
}
