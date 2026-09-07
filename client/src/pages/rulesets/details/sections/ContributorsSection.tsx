import { BlankState, FormDialog, Modal, DiceSpinner } from "@/client/src/components/common/index.ts";
import { useSnackbar } from "@/client/src/contexts/ToastContext.tsx";
import { useIsMobile } from "@/client/src/hooks/index.ts";
import { useRulesetPermissions } from "@/client/src/pages/rulesets/hooks/index.ts";
import { queryKeys } from "@/client/src/lib/queryKeys.ts";
import { rpc } from "@/client/src/services/rpc.ts";
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
  Chip,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  FormControl,
  IconButton,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import {
  keepPreviousData,
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import type { InferResponseType } from "hono/client";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";

type ContributorsResponse = InferResponseType<(typeof rpc.api.rulesets)[":id"]["contributors"]["$get"]>;
type ContributorsPaginated = Exclude<ContributorsResponse, { error: string }>;
type Contributor = ContributorsPaginated["items"][number];

type ContributorRole = "Admin" | "Editor" | "Viewer";

interface ContributorsSectionProps {
  ruleset: {
    id: string;
    name: string;
    userId?: string | null;
    status?: string;
    contributorRole?: string | null;
  };
  onLeave?: () => void;
  childOnly?: boolean;
  onChildOnlyChange?: (childOnly: boolean) => void;
}

function getRoleColor(role: string): "error" | "primary" | "default" {
  switch (role) {
    case "Admin": return "error";
    case "Editor": return "primary";
    case "Viewer": return "default";
    default: return "default";
  }
}

function getStatusColor(status: string): "warning" | "success" | "error" | "default" {
  switch (status) {
    case "Pending": return "warning";
    case "Active": return "success";
    case "Rejected": return "error";
    case "Revoked": return "default";
    default: return "default";
  }
}

// Invite Dialog
interface InviteFormData {
  email: string;
  role: ContributorRole;
}

function InviteContributorDialog({
  open,
  onClose,
  onSubmit,
  isLoading,
  isOwner,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (data: InviteFormData) => void;
  isLoading: boolean;
  isOwner: boolean;
}) {
  const form = useForm<InviteFormData>({
    defaultValues: { email: "", role: "Editor" },
  });
  const { control, handleSubmit, reset } = form;

  const handleClose = () => {
    reset();
    onClose();
  };

  return (
    <FormDialog
      open={open}
      onClose={handleClose}
      form={form}
      isLoading={isLoading}
    >
      <form onSubmit={handleSubmit((data) => { onSubmit(data); reset(); })}>
        <DialogTitle>Invite Contributor</DialogTitle>
        <DialogContent>
          <Controller
            name="email"
            control={control}
            rules={{ required: "Email is required", pattern: { value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/, message: "Invalid email" } }}
            render={({ field, fieldState }) => (
              <TextField
                {...field}
                label="Email address"
                fullWidth
                margin="normal"
                error={!!fieldState.error}
                helperText={fieldState.error?.message}
                autoFocus
              />
            )}
          />
          <Controller
            name="role"
            control={control}
            render={({ field }) => (
              <FormControl fullWidth margin="normal">
                <InputLabel>Role</InputLabel>
                <Select {...field} label="Role">
                  {isOwner && <MenuItem value="Admin">Admin</MenuItem>}
                  <MenuItem value="Editor">Editor</MenuItem>
                  <MenuItem value="Viewer">Viewer</MenuItem>
                </Select>
              </FormControl>
            )}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={handleClose} variant="outlined" color="inherit">Cancel</Button>
          <Button type="submit" variant="contained" disabled={isLoading}>
            {isLoading ? "Inviting..." : "Invite"}
          </Button>
        </DialogActions>
      </form>
    </FormDialog>
  );
}

// Edit Role Dialog
function EditRoleDialog({
  open,
  onClose,
  onSubmit,
  isLoading,
  currentRole,
  isOwner,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (role: ContributorRole) => void;
  isLoading: boolean;
  currentRole: ContributorRole;
  isOwner: boolean;
}) {
  const [role, setRole] = useState<ContributorRole>(currentRole);

  return (
    <Modal open={open} onClose={onClose} maxWidth="xs">
      <DialogTitle>Update Role</DialogTitle>
      <DialogContent>
        <FormControl fullWidth margin="normal">
          <InputLabel>Role</InputLabel>
          <Select value={role} onChange={(e) => setRole(e.target.value as ContributorRole)} label="Role">
            {isOwner && <MenuItem value="Admin">Admin</MenuItem>}
            <MenuItem value="Editor">Editor</MenuItem>
            <MenuItem value="Viewer">Viewer</MenuItem>
          </Select>
        </FormControl>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} variant="outlined" color="inherit">Cancel</Button>
        <Button variant="contained" onClick={() => onSubmit(role)} disabled={isLoading}>
          {isLoading ? "Saving..." : "Save"}
        </Button>
      </DialogActions>
    </Modal>
  );
}

// Remove Contributor Dialog
function RemoveContributorDialog({
  open,
  onClose,
  onConfirm,
  isLoading,
  contributorName,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  isLoading: boolean;
  contributorName: string;
}) {
  return (
    <Modal open={open} onClose={onClose} maxWidth="xs">
      <DialogTitle>Remove Contributor</DialogTitle>
      <DialogContent>
        <DialogContentText>
          Are you sure you want to remove <strong>{contributorName}</strong> as a contributor?
        </DialogContentText>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} variant="outlined" color="inherit">Cancel</Button>
        <Button variant="contained" color="error" onClick={onConfirm} disabled={isLoading}>
          {isLoading ? "Removing..." : "Remove"}
        </Button>
      </DialogActions>
    </Modal>
  );
}

// Leave Ruleset Dialog
function LeaveRulesetDialog({
  open,
  onClose,
  onConfirm,
  isLoading,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  isLoading: boolean;
}) {
  return (
    <Modal open={open} onClose={onClose} maxWidth="xs">
      <DialogTitle>Leave Ruleset</DialogTitle>
      <DialogContent>
        <DialogContentText>
          Are you sure you want to leave this ruleset? You will lose access unless re-invited.
        </DialogContentText>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} variant="outlined" color="inherit">Cancel</Button>
        <Button variant="contained" color="warning" onClick={onConfirm} disabled={isLoading}>
          {isLoading ? "Leaving..." : "Leave"}
        </Button>
      </DialogActions>
    </Modal>
  );
}

export function ContributorsSection({ ruleset, onLeave }: ContributorsSectionProps) {
  const isMobile = useIsMobile();
  const queryClient = useQueryClient();
  const snackbar = useSnackbar();
  const { isOwner, canManageContributors } = useRulesetPermissions(ruleset);
  const isArchived = ruleset.status === "Archived";
  // Invite + role-edit hit endpoints that throw on archived rulesets; gate the
  // affordances. Remove still uses canManageContributors so the owner can clean
  // up stale rows on an archived ruleset without unarchiving.
  const canInvite = canManageContributors && !isArchived;
  const canEditRoles = canManageContributors && !isArchived;

  // Dialog states
  const [inviteDialogOpen, setInviteDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [removeDialogOpen, setRemoveDialogOpen] = useState(false);
  const [leaveDialogOpen, setLeaveDialogOpen] = useState(false);
  const [selectedContributor, setSelectedContributor] = useState<Contributor | null>(null);

  // Fetch contributors
  const { data, isLoading, error, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteQuery({
    queryKey: queryKeys.rulesets.section(ruleset.id, "contributors"),
    queryFn: async ({ pageParam }) => {
      const response = await rpc.api.rulesets[":id"].contributors.$get({
        param: { id: ruleset.id },
        query: { page: pageParam.toString(), limit: "10" },
      });
      if (!response.ok) throw new Error("Failed to fetch contributors");
      return response.json();
    },
    initialPageParam: 1,
    getNextPageParam: (lastPage) => lastPage.nextPage,
    placeholderData: keepPreviousData,
  });

  const contributors = data?.pages.flatMap((page) => page.items) ?? [];
  const owner = data?.pages[0]?.owner ?? null;

  // Mutations
  const inviteMutation = useMutation({
    mutationFn: async (data: InviteFormData) => {
      const response = await rpc.api.rulesets[":id"].contributors.$post({
        param: { id: ruleset.id },
        json: data,
      });
      if (!response.ok) {
        const err = await response.json();
        throw new Error("error" in err ? err.error : "Failed to invite contributor");
      }
      return response.json();
    },
    onSuccess: () => {
      snackbar.success("Contributor invited");
      queryClient.invalidateQueries({ queryKey: queryKeys.rulesets.section(ruleset.id, "contributors") });
      setInviteDialogOpen(false);
    },
    onError: (error) => {
      snackbar.error(error);
    },
  });

  const updateRoleMutation = useMutation({
    mutationFn: async ({ contributorId, role }: { contributorId: string; role: ContributorRole }) => {
      const response = await rpc.api.rulesets[":id"].contributors[":contributorId"].$put({
        param: { id: ruleset.id, contributorId },
        json: { role },
      });
      if (!response.ok) {
        const err = await response.json();
        throw new Error("error" in err ? err.error : "Failed to update role");
      }
      return response.json();
    },
    onSuccess: () => {
      snackbar.success("Role updated");
      queryClient.invalidateQueries({ queryKey: queryKeys.rulesets.section(ruleset.id, "contributors") });
      setEditDialogOpen(false);
    },
    onError: (error) => {
      snackbar.error(error);
    },
  });

  const revokeMutation = useMutation({
    mutationFn: async (contributorId: string) => {
      const response = await rpc.api.rulesets[":id"].contributors[":contributorId"].$delete({
        param: { id: ruleset.id, contributorId },
      });
      if (!response.ok) {
        const err = await response.json();
        throw new Error("error" in err ? err.error : "Failed to remove contributor");
      }
      return response.json();
    },
    onSuccess: () => {
      snackbar.success("Contributor removed");
      queryClient.invalidateQueries({ queryKey: queryKeys.rulesets.section(ruleset.id, "contributors") });
      setRemoveDialogOpen(false);
    },
    onError: (error) => {
      snackbar.error(error);
    },
  });

  const leaveMutation = useMutation({
    mutationFn: async () => {
      const response = await rpc.api.rulesets[":id"].contributors.leave.$post({
        param: { id: ruleset.id },
      });
      if (!response.ok) {
        const err = await response.json();
        throw new Error("error" in err ? err.error : "Failed to leave ruleset");
      }
      return response.json();
    },
    onSuccess: () => {
      snackbar.success("You have left this ruleset");
      queryClient.invalidateQueries({ queryKey: queryKeys.rulesets.lists });
      onLeave?.();
    },
    onError: (error) => {
      snackbar.error(error);
    },
  });

  const handleEditRole = (contributor: Contributor) => {
    setSelectedContributor(contributor);
    setEditDialogOpen(true);
  };

  const handleRemove = (contributor: Contributor) => {
    setSelectedContributor(contributor);
    setRemoveDialogOpen(true);
  };

  const getContributorName = (contributor: Contributor) => {
    return contributor.user?.username || contributor.user?.emailAddress || contributor.email;
  };

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

  const headerActions = ((!isOwner && ruleset.contributorRole) || canManageContributors);

  return (
    <Box>
      {headerActions && (
        <Box sx={{ display: "flex", justifyContent: "flex-end", gap: 1, mb: 2 }}>
          {!isOwner && ruleset.contributorRole && (
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
              size={isMobile ? "small" : "medium"}
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
          action={
            canInvite ? (
              <Button
                variant="outlined"
                startIcon={<AddIcon />}
                onClick={() => setInviteDialogOpen(true)}
              >
                Invite a Contributor
              </Button>
            ) : undefined
          }
        />
      ) : (
        <>
          <TableContainer component={Paper} variant="outlined">
            <Table size={isMobile ? "small" : "medium"}>
              <TableHead>
                <TableRow>
                  <TableCell>User</TableCell>
                  {!isMobile && <TableCell>Email</TableCell>}
                  <TableCell>Role</TableCell>
                  <TableCell>Status</TableCell>
                  {canManageContributors && <TableCell align="right">Actions</TableCell>}
                </TableRow>
              </TableHead>
              <TableBody>
                {owner && (
                  <TableRow>
                    <TableCell>
                      <Typography variant="body2" sx={{ fontWeight: 500 }}>
                        {owner.username || "—"}
                      </Typography>
                      {isMobile && (
                        <Typography variant="caption" sx={{ color: "text.secondary" }}>
                          {owner.emailAddress}
                        </Typography>
                      )}
                    </TableCell>
                    {!isMobile && <TableCell>{owner.emailAddress}</TableCell>}
                    <TableCell>
                      <Chip label="Owner" size="small" color="primary" variant="filled" />
                    </TableCell>
                    <TableCell>
                      <Chip label="Active" size="small" color="success" variant="filled" />
                    </TableCell>
                    {canManageContributors && <TableCell align="right" />}
                  </TableRow>
                )}
                {contributors.map((contributor) => {
                  const canEditThis = canEditRoles &&
                    contributor.status === "Active" &&
                    (isOwner || contributor.role !== "Admin");
                  const canRemoveThis = canManageContributors &&
                    (isOwner || contributor.role !== "Admin");

                  return (
                    <TableRow
                      key={contributor.id}
                      sx={{
                        "&:hover .row-actions": { opacity: 1 },
                      }}
                    >
                      <TableCell>
                        <Typography variant="body2" sx={{
                          fontWeight: 500
                        }}>
                          {contributor.user?.username || "—"}
                        </Typography>
                        {isMobile && (
                          <Typography variant="caption" sx={{
                            color: "text.secondary"
                          }}>
                            {contributor.email}
                          </Typography>
                        )}
                      </TableCell>
                      {!isMobile && <TableCell>{contributor.email}</TableCell>}
                      <TableCell>
                        <Chip label={contributor.role} size="small" color={getRoleColor(contributor.role)} variant="outlined" />
                      </TableCell>
                      <TableCell>
                        <Chip label={contributor.status} size="small" color={getStatusColor(contributor.status)} variant="filled" />
                      </TableCell>
                      {canManageContributors && (
                        <TableCell align="right">
                          <Box
                            className="row-actions"
                            sx={{
                              opacity: isMobile ? 1 : 0,
                              transition: "opacity 0.2s ease",
                              display: "flex",
                              gap: 0.5,
                              justifyContent: "flex-end",
                            }}
                          >
                            {canEditThis && (
                              <Tooltip title="Edit role">
                                <IconButton size="small" onClick={() => handleEditRole(contributor)}>
                                  <EditIcon fontSize="small" />
                                </IconButton>
                              </Tooltip>
                            )}
                            {canRemoveThis && (
                              <Tooltip title="Remove">
                                <IconButton size="small" color="error" onClick={() => handleRemove(contributor)}>
                                  <DeleteIcon fontSize="small" />
                                </IconButton>
                              </Tooltip>
                            )}
                          </Box>
                        </TableCell>
                      )}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>

          {hasNextPage && (
            <Box sx={{ display: "flex", justifyContent: "center", mt: 2 }}>
              <Button onClick={() => fetchNextPage()} disabled={isFetchingNextPage}>
                {isFetchingNextPage ? "Loading..." : "Load More"}
              </Button>
            </Box>
          )}
        </>
      )}
      {/* Dialogs */}
      <InviteContributorDialog
        open={inviteDialogOpen}
        onClose={() => setInviteDialogOpen(false)}
        onSubmit={(data) => inviteMutation.mutate(data)}
        isLoading={inviteMutation.isPending}
        isOwner={isOwner}
      />
      {selectedContributor && (
        <>
          <EditRoleDialog
            open={editDialogOpen}
            onClose={() => setEditDialogOpen(false)}
            onSubmit={(role) => updateRoleMutation.mutate({ contributorId: selectedContributor.id, role })}
            isLoading={updateRoleMutation.isPending}
            currentRole={selectedContributor.role as ContributorRole}
            isOwner={isOwner}
          />
          <RemoveContributorDialog
            open={removeDialogOpen}
            onClose={() => setRemoveDialogOpen(false)}
            onConfirm={() => revokeMutation.mutate(selectedContributor.id)}
            isLoading={revokeMutation.isPending}
            contributorName={getContributorName(selectedContributor)}
          />
        </>
      )}
      <LeaveRulesetDialog
        open={leaveDialogOpen}
        onClose={() => setLeaveDialogOpen(false)}
        onConfirm={() => leaveMutation.mutate()}
        isLoading={leaveMutation.isPending}
      />
    </Box>
  );
}
