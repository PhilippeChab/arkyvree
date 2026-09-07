import { BlankState, DiceSpinner, FormDialog, Modal } from "@/client/src/components/common/index.ts";
import { useSnackbar } from "@/client/src/contexts/ToastContext.tsx";
import { useIsMobile } from "@/client/src/hooks/index.ts";
import { queryKeys } from "@/client/src/lib/queryKeys.ts";
import { rpc } from "@/client/src/services/rpc.ts";
import { Add as AddIcon, Delete as DeleteIcon, ExitToApp as LeaveIcon, People as ContributorsIcon } from "@mui/icons-material";
import {
  Alert,
  Box,
  Button,
  Chip,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  IconButton,
  Paper,
  Stack,
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
import { keepPreviousData, useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { InferResponseType } from "hono/client";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { useNavigate } from "react-router-dom";

type ContributorsResponse = InferResponseType<(typeof rpc.api.characters)[":id"]["contributors"]["$get"]>;
type ContributorsPaginated = Exclude<ContributorsResponse, { error: string }>;
type Contributor = ContributorsPaginated["items"][number];

interface ContributorsDialogProps {
  open: boolean;
  onClose: () => void;
  characterId: string;
  isOwner: boolean;
  isArchived: boolean;
}

interface InviteFormData {
  email: string;
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

function InviteContributorDialog({
  open,
  onClose,
  onSubmit,
  isLoading,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (data: InviteFormData) => void;
  isLoading: boolean;
}) {
  const form = useForm<InviteFormData>({ defaultValues: { email: "" } });
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
        </DialogContent>
        <DialogActions>
          <Button onClick={handleClose} variant="outlined" color="inherit">Cancel</Button>
          <Button type="submit" variant="contained" disabled={isLoading}>
            <DiceSpinner size="small" loading={isLoading}>Invite</DiceSpinner>
          </Button>
        </DialogActions>
      </form>
    </FormDialog>
  );
}

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
          <DiceSpinner size="small" loading={isLoading}>Remove</DiceSpinner>
        </Button>
      </DialogActions>
    </Modal>
  );
}

export function ContributorsDialog({ open, onClose, characterId, isOwner, isArchived }: ContributorsDialogProps) {
  const canInvite = isOwner && !isArchived;
  const isMobile = useIsMobile();
  const queryClient = useQueryClient();
  const snackbar = useSnackbar();
  const navigate = useNavigate();

  const [inviteOpen, setInviteOpen] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<Contributor | null>(null);
  const [leaveConfirmOpen, setLeaveConfirmOpen] = useState(false);

  const { data, isLoading, error, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteQuery({
    queryKey: queryKeys.characters.contributors(characterId),
    queryFn: async ({ pageParam }) => {
      const response = await rpc.api.characters[":id"].contributors.$get({
        param: { id: characterId },
        query: { page: pageParam.toString(), limit: "10" },
      });
      if (!response.ok) throw new Error("Failed to fetch contributors");
      return response.json();
    },
    initialPageParam: 1,
    getNextPageParam: (lastPage) => lastPage.nextPage,
    placeholderData: keepPreviousData,
    enabled: open,
  });

  const contributors = data?.pages.flatMap((page) => page.items) ?? [];
  const owner = data?.pages[0]?.owner ?? null;

  const inviteMutation = useMutation({
    mutationFn: async (formData: InviteFormData) => {
      const response = await rpc.api.characters[":id"].contributors.$post({
        param: { id: characterId },
        json: { email: formData.email },
      });
      return response.json();
    },
    onSuccess: () => {
      snackbar.success("Contributor invited");
      queryClient.invalidateQueries({ queryKey: queryKeys.characters.contributors(characterId) });
      setInviteOpen(false);
    },
    onError: (err) => {
      snackbar.error(err);
    },
  });

  const revokeMutation = useMutation({
    mutationFn: async (contributorId: string) => {
      const response = await rpc.api.characters[":id"].contributors[":contributorId"].$delete({
        param: { id: characterId, contributorId },
      });
      return response.json();
    },
    onSuccess: () => {
      snackbar.success("Contributor removed");
      queryClient.invalidateQueries({ queryKey: queryKeys.characters.contributors(characterId) });
      setRemoveTarget(null);
    },
    onError: (err) => {
      snackbar.error(err);
    },
  });

  const leaveMutation = useMutation({
    mutationFn: async () => {
      const response = await rpc.api.characters[":id"].contributors.leave.$post({
        param: { id: characterId },
      });
      return response.json();
    },
    onSuccess: () => {
      snackbar.success("You have left this character");
      queryClient.invalidateQueries({ queryKey: queryKeys.characters.lists });
      setLeaveConfirmOpen(false);
      onClose();
      navigate("/characters");
    },
    onError: (err) => {
      snackbar.error(err);
    },
  });

  const getName = (c: Contributor) => c.user?.username || c.user?.emailAddress || c.email;

  return (
    <>
      <Modal open={open} onClose={onClose} maxWidth="sm" fullScreen={isMobile}>
        <DialogTitle>Contributors</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2}>
            <Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "center", gap: 1 }}>
              <Typography variant="body2" sx={{ color: "text.secondary" }}>
                Contributors can edit this character and download its PDF.
              </Typography>
              {canInvite ? (
                <Button
                  variant="contained"
                  size={isMobile ? "small" : "medium"}
                  startIcon={<AddIcon />}
                  onClick={() => setInviteOpen(true)}
                >
                  Invite
                </Button>
              ) : !isOwner ? (
                <Button
                  variant="outlined"
                  color="warning"
                  size="small"
                  startIcon={<LeaveIcon />}
                  onClick={() => setLeaveConfirmOpen(true)}
                >
                  Leave
                </Button>
              ) : null}
            </Stack>

            <Box sx={{ minHeight: { xs: 280, sm: 360 }, display: "flex", flexDirection: "column" }}>
              {isLoading ? (
                <Box sx={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <DiceSpinner />
                </Box>
              ) : error ? (
                <Alert severity="error">Failed to load contributors</Alert>
              ) : contributors.length === 0 && !owner ? (
                <BlankState
                  icon={<ContributorsIcon sx={{ fontSize: { xs: 56, sm: 80 }, color: "text.secondary", mb: 2 }} />}
                  title="No contributors yet"
                  description={canInvite
                    ? "Invite collaborators to help maintain this character."
                    : "This character has no other contributors."}
                  action={canInvite ? (
                    <Button variant="outlined" startIcon={<AddIcon />} onClick={() => setInviteOpen(true)}>
                      Invite a Contributor
                    </Button>
                  ) : undefined}
                />
              ) : (
                <>
                  <TableContainer component={Paper} variant="outlined">
                    <Table size={isMobile ? "small" : "medium"}>
                      <TableHead>
                        <TableRow>
                          <TableCell>User</TableCell>
                          {!isMobile && <TableCell>Email</TableCell>}
                          <TableCell>Status</TableCell>
                          {isOwner && <TableCell align="right">Actions</TableCell>}
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
                            {isOwner && <TableCell align="right" />}
                          </TableRow>
                        )}
                        {contributors.map((contributor) => (
                          <TableRow
                            key={contributor.id}
                            sx={{ "&:hover .row-actions": { opacity: 1 } }}
                          >
                            <TableCell>
                              <Typography variant="body2" sx={{ fontWeight: 500 }}>
                                {contributor.user?.username || "—"}
                              </Typography>
                              {isMobile && (
                                <Typography variant="caption" sx={{ color: "text.secondary" }}>
                                  {contributor.email}
                                </Typography>
                              )}
                            </TableCell>
                            {!isMobile && <TableCell>{contributor.email}</TableCell>}
                            <TableCell>
                              <Chip
                                label={contributor.status}
                                size="small"
                                color={getStatusColor(contributor.status)}
                                variant="filled"
                              />
                            </TableCell>
                            {isOwner && (
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
                                  <Tooltip title="Remove">
                                    <IconButton size="small" color="error" onClick={() => setRemoveTarget(contributor)}>
                                      <DeleteIcon fontSize="small" />
                                    </IconButton>
                                  </Tooltip>
                                </Box>
                              </TableCell>
                            )}
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TableContainer>

                  {hasNextPage && (
                    <Box sx={{ display: "flex", justifyContent: "center", mt: 2 }}>
                      <Button onClick={() => fetchNextPage()} disabled={isFetchingNextPage}>
                        <DiceSpinner size="small" loading={isFetchingNextPage}>Load More</DiceSpinner>
                      </Button>
                    </Box>
                  )}
                </>
              )}
            </Box>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose} variant="outlined" color="inherit">Close</Button>
        </DialogActions>
      </Modal>

      <InviteContributorDialog
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        onSubmit={(data) => inviteMutation.mutate(data)}
        isLoading={inviteMutation.isPending}
      />

      {removeTarget && (
        <RemoveContributorDialog
          open
          onClose={() => setRemoveTarget(null)}
          onConfirm={() => revokeMutation.mutate(removeTarget.id)}
          isLoading={revokeMutation.isPending}
          contributorName={getName(removeTarget)}
        />
      )}

      <LeaveContributorDialog
        open={leaveConfirmOpen}
        onClose={() => setLeaveConfirmOpen(false)}
        onConfirm={() => leaveMutation.mutate()}
        isLoading={leaveMutation.isPending}
      />
    </>
  );
}

function LeaveContributorDialog({
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
      <DialogTitle>Leave character</DialogTitle>
      <DialogContent>
        <DialogContentText>
          Are you sure you want to stop contributing to this character? You will lose edit access unless re-invited.
        </DialogContentText>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={isLoading} variant="outlined" color="inherit">Cancel</Button>
        <Button variant="contained" color="warning" onClick={onConfirm} disabled={isLoading}>
          <DiceSpinner size="small" loading={isLoading}>Leave</DiceSpinner>
        </Button>
      </DialogActions>
    </Modal>
  );
}
