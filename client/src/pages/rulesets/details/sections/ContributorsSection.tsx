import { BlankState, ConfirmDialog, DiceSpinner, LoadMoreButton, Modal } from "@/client/src/components/common/index.ts";
import {
  ContributorsTable,
  InviteContributorDialog,
  type ContributorRole,
} from "@/client/src/components/contributors/index.ts";
import { useSnackbar } from "@/client/src/contexts/ToastContext.tsx";
import { useRulesetPermissions } from "@/client/src/pages/rulesets/hooks/index.ts";
import { queryKeys } from "@/client/src/lib/queryKeys.ts";
import { parseResponse, rpc } from "@/client/src/services/rpc.ts";
import {
  Add as AddIcon,
  Delete as DeleteIcon,
  Edit as EditIcon,
  ExitToApp as LeaveIcon,
  People as ContributorsIcon,
} from "@mui/icons-material";
import {
  Alert,
  Box,
  Button,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  IconButton,
  InputLabel,
  MenuItem,
  Select,
  Tooltip,
} from "@mui/material";
import {
  keepPreviousData,
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import type { InferResponseType } from "hono/client";
import { useState } from "react";

type Contributor = InferResponseType<(typeof rpc.api.rulesets)[":id"]["contributors"]["$get"], 200>["items"][number];

interface ContributorsSectionProps {
  ruleset: {
    id: string;
    name: string;
    userId?: string | null;
    status?: string;
    contributorRole?: string | null;
  };
  onLeave?: () => void;
}

function EditRoleDialog({
  open,
  onClose,
  onSubmit,
  isLoading,
  currentRole,
  roles,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (role: ContributorRole) => void;
  isLoading: boolean;
  currentRole: ContributorRole;
  roles: ContributorRole[];
}) {
  const [role, setRole] = useState<ContributorRole>(currentRole);

  return (
    <Modal open={open} onClose={() => !isLoading && onClose()} maxWidth="xs">
      <DialogTitle>Update Role</DialogTitle>
      <DialogContent>
        <FormControl fullWidth margin="normal">
          <InputLabel>Role</InputLabel>
          <Select value={role} onChange={(e) => setRole(e.target.value as ContributorRole)} label="Role">
            {roles.map((r) => <MenuItem key={r} value={r}>{r}</MenuItem>)}
          </Select>
        </FormControl>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={isLoading} variant="outlined" color="inherit">Cancel</Button>
        <Button variant="contained" onClick={() => onSubmit(role)} disabled={isLoading}>
          <DiceSpinner size="small" loading={isLoading}>Save</DiceSpinner>
        </Button>
      </DialogActions>
    </Modal>
  );
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
  const [roleTarget, setRoleTarget] = useState<Contributor | null>(null);
  const [removeTarget, setRemoveTarget] = useState<Contributor | null>(null);
  const [leaveDialogOpen, setLeaveDialogOpen] = useState(false);

  const contributorsKey = queryKeys.rulesets.section(ruleset.id, "contributors");

  const { data, isLoading, error, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteQuery({
    queryKey: contributorsKey,
    queryFn: ({ pageParam }) => parseResponse(rpc.api.rulesets[":id"].contributors.$get({
      param: { id: ruleset.id },
      query: { page: pageParam.toString(), limit: "10" },
    })),
    initialPageParam: 1,
    getNextPageParam: (lastPage) => lastPage.nextPage,
    placeholderData: keepPreviousData,
  });

  const contributors = data?.pages.flatMap((page) => page.items) ?? [];
  const owner = data?.pages[0]?.owner ?? null;

  const inviteMutation = useMutation({
    mutationFn: (invite: { email: string; role: ContributorRole }) =>
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
      setRoleTarget(null);
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
      snackbar.success("You have left this ruleset");
      queryClient.invalidateQueries({ queryKey: queryKeys.rulesets.lists });
      setLeaveDialogOpen(false);
      onLeave?.();
    },
    onError: (error) => snackbar.error(error, "Failed to leave ruleset"),
  });

  if (isLoading) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
        <DiceSpinner />
      </Box>
    );
  }

  if (error) {
    return <Alert severity="error">Failed to load contributors</Alert>;
  }

  const canLeave = !isOwner && !!ruleset.contributorRole;

  return (
    <Box>
      {(canLeave || canInvite) && (
        <Box sx={{ display: "flex", justifyContent: "flex-end", gap: 1, mb: 2 }}>
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
          {canInvite && (
            <Button
              variant="contained"
              startIcon={<AddIcon />}
              onClick={() => setInviteDialogOpen(true)}
            >
              Invite
            </Button>
          )}
        </Box>
      )}
      {contributors.length === 0 && !owner ? (
        <BlankState
          icon={<ContributorsIcon sx={{ fontSize: { xs: 56, sm: 80 }, color: "text.secondary", mb: 2 }} />}
          title="No contributors yet"
          description={canInvite ? "Invite collaborators to help build this ruleset" : "This ruleset has no contributors"}
          action={canInvite ? (
            <Button variant="outlined" startIcon={<AddIcon />} onClick={() => setInviteDialogOpen(true)}>
              Invite a Contributor
            </Button>
          ) : undefined}
        />
      ) : (
        <>
          <ContributorsTable
            owner={owner}
            contributors={contributors}
            showRoles
            renderActions={canManageContributors ? (contributor) => {
              // Only the owner can change or remove an Admin.
              const outranks = isOwner || contributor.role !== "Admin";
              return (
                <>
                  {canEditRoles && outranks && contributor.status === "Active" && (
                    <Tooltip title="Edit role">
                      <IconButton size="small" onClick={() => setRoleTarget(contributor)}>
                        <EditIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  )}
                  {outranks && (
                    <Tooltip title="Remove">
                      <IconButton size="small" color="error" onClick={() => setRemoveTarget(contributor)}>
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  )}
                </>
              );
            } : undefined}
          />
          <LoadMoreButton
            hasNextPage={hasNextPage}
            isFetchingNextPage={isFetchingNextPage}
            onClick={() => fetchNextPage()}
          />
        </>
      )}

      <InviteContributorDialog
        open={inviteDialogOpen}
        onClose={() => setInviteDialogOpen(false)}
        onSubmit={(invite, onSent) => inviteMutation.mutate(invite, { onSuccess: onSent })}
        isLoading={inviteMutation.isPending}
        roles={assignableRoles}
      />
      {roleTarget && (
        <EditRoleDialog
          // Keyed so each contributor opens with their own role.
          key={roleTarget.id}
          open
          onClose={() => setRoleTarget(null)}
          onSubmit={(role) => updateRoleMutation.mutate({ contributorId: roleTarget.id, role })}
          isLoading={updateRoleMutation.isPending}
          currentRole={roleTarget.role as ContributorRole}
          roles={assignableRoles}
        />
      )}
      {removeTarget && (
        <ConfirmDialog
          open
          onClose={() => setRemoveTarget(null)}
          onConfirm={() => revokeMutation.mutate(removeTarget.id)}
          isLoading={revokeMutation.isPending}
          title="Remove Contributor"
          message={<>Are you sure you want to remove <strong>{removeTarget.user?.username || removeTarget.email}</strong> as a contributor?</>}
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
