import { BlankState, ConfirmDialog, DiceSpinner, LoadMoreButton, Modal } from "@/client/src/components/common/index.ts";
import { ContributorsTable, InviteContributorDialog } from "@/client/src/components/contributors/index.ts";
import { useSnackbar } from "@/client/src/contexts/ToastContext.tsx";
import { queryKeys } from "@/client/src/lib/queryKeys.ts";
import { parseResponse, rpc } from "@/client/src/services/rpc.ts";
import { Add as AddIcon, Delete as DeleteIcon, ExitToApp as LeaveIcon, People as ContributorsIcon } from "@mui/icons-material";
import {
  Alert,
  Box,
  Button,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Stack,
  Tooltip,
  Typography,
} from "@mui/material";
import { keepPreviousData, useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { InferResponseType } from "hono/client";
import { useState } from "react";
import { useNavigate } from "react-router-dom";

type Contributor = InferResponseType<(typeof rpc.api.characters)[":id"]["contributors"]["$get"], 200>["items"][number];

interface ContributorsDialogProps {
  open: boolean;
  onClose: () => void;
  characterId: string;
  isOwner: boolean;
  isArchived: boolean;
}

export function ContributorsDialog({ open, onClose, characterId, isOwner, isArchived }: ContributorsDialogProps) {
  const canInvite = isOwner && !isArchived;
  const queryClient = useQueryClient();
  const snackbar = useSnackbar();
  const navigate = useNavigate();

  const [inviteOpen, setInviteOpen] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<Contributor | null>(null);
  const [leaveConfirmOpen, setLeaveConfirmOpen] = useState(false);

  const contributorsKey = queryKeys.characters.contributors(characterId);

  const { data, isLoading, error, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteQuery({
    queryKey: contributorsKey,
    queryFn: ({ pageParam }) => parseResponse(rpc.api.characters[":id"].contributors.$get({
      param: { id: characterId },
      query: { page: pageParam.toString(), limit: "10" },
    })),
    initialPageParam: 1,
    getNextPageParam: (lastPage) => lastPage.nextPage,
    placeholderData: keepPreviousData,
    enabled: open,
  });

  const contributors = data?.pages.flatMap((page) => page.items) ?? [];
  const owner = data?.pages[0]?.owner ?? null;

  const inviteMutation = useMutation({
    mutationFn: (email: string) =>
      rpc.api.characters[":id"].contributors.$post({ param: { id: characterId }, json: { email } }),
    onSuccess: () => {
      snackbar.success("Contributor invited");
      queryClient.invalidateQueries({ queryKey: contributorsKey });
      setInviteOpen(false);
    },
    onError: (err) => snackbar.error(err, "Failed to invite contributor"),
  });

  const revokeMutation = useMutation({
    mutationFn: (contributorId: string) =>
      rpc.api.characters[":id"].contributors[":contributorId"].$delete({
        param: { id: characterId, contributorId },
      }),
    onSuccess: () => {
      snackbar.success("Contributor removed");
      queryClient.invalidateQueries({ queryKey: contributorsKey });
      setRemoveTarget(null);
    },
    onError: (err) => snackbar.error(err, "Failed to remove contributor"),
  });

  const leaveMutation = useMutation({
    mutationFn: () => rpc.api.characters[":id"].contributors.leave.$post({ param: { id: characterId } }),
    onSuccess: () => {
      snackbar.success("You have left this character");
      queryClient.invalidateQueries({ queryKey: queryKeys.characters.lists });
      setLeaveConfirmOpen(false);
      onClose();
      navigate("/characters");
    },
    onError: (err) => snackbar.error(err, "Failed to leave character"),
  });

  return (
    <>
      <Modal open={open} onClose={onClose}>
        <DialogTitle>Contributors</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2}>
            <Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "center", gap: 1 }}>
              <Typography variant="body2" sx={{ color: "text.secondary" }}>
                Contributors can edit this character and download its PDF.
              </Typography>
              {canInvite ? (
                <Button variant="contained" startIcon={<AddIcon />} onClick={() => setInviteOpen(true)}>
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
                  <ContributorsTable
                    owner={owner}
                    contributors={contributors}
                    renderActions={isOwner ? (contributor) => (
                      <Tooltip title="Remove">
                        <IconButton size="small" color="error" onClick={() => setRemoveTarget(contributor)}>
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    ) : undefined}
                  />
                  <LoadMoreButton
                    hasNextPage={hasNextPage}
                    isFetchingNextPage={isFetchingNextPage}
                    onClick={() => fetchNextPage()}
                  />
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
        onSubmit={({ email }, onSent) => inviteMutation.mutate(email, { onSuccess: onSent })}
        isLoading={inviteMutation.isPending}
      />

      {removeTarget && (
        <ConfirmDialog
          open
          onClose={() => setRemoveTarget(null)}
          onConfirm={() => revokeMutation.mutate(removeTarget.id)}
          isLoading={revokeMutation.isPending}
          title="Remove Contributor"
          message={<>Are you sure you want to remove <strong>{removeTarget.user?.username || removeTarget.user?.emailAddress || removeTarget.email}</strong> as a contributor?</>}
          confirmLabel="Remove"
          confirmColor="error"
          maxWidth="xs"
        />
      )}

      <ConfirmDialog
        open={leaveConfirmOpen}
        onClose={() => setLeaveConfirmOpen(false)}
        onConfirm={() => leaveMutation.mutate()}
        isLoading={leaveMutation.isPending}
        title="Leave Character"
        message="Are you sure you want to stop contributing to this character? You will lose edit access unless re-invited."
        confirmLabel="Leave"
        confirmColor="warning"
        maxWidth="xs"
      />
    </>
  );
}
