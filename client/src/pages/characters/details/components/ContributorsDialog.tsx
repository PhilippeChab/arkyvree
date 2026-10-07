import {
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
import { type InferResponseType, parseResponse } from "hono/client";
import { useState } from "react";
import { useNavigate } from "react-router-dom";

import {
  BlankState,
  ConfirmDialog,
  DiceSpinner,
  LoadError,
  LoadMoreButton,
  Modal,
} from "@/client/src/components/common/index.ts";
import { ContributorsTable, InviteContributorDialog } from "@/client/src/components/contributors/index.ts";
import { AddIcon, ContributorsIcon, DeleteIcon, LeaveIcon } from "@/client/src/components/icons/index.ts";
import { useSnackbar } from "@/client/src/contexts/useSnackbar.ts";
import { firstPage, pageItems } from "@/client/src/lib/pageItems.ts";
import { QUERY_KEYS } from "@/client/src/lib/queryKeys.ts";
import { characterContributorsQuery } from "@/client/src/pages/characters/characterQueries.ts";
import { rpc } from "@/client/src/services/rpc.ts";

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

  const contributorsKey = QUERY_KEYS.characters.contributors(characterId);

  const { data, isLoading, error, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteQuery({
    ...characterContributorsQuery(characterId),
    placeholderData: keepPreviousData,
    enabled: open,
  });

  const contributors = pageItems(data);
  const owner = firstPage(data)?.owner ?? null;

  const inviteMutation = useMutation({
    mutationFn: (email: string) =>
      parseResponse(rpc.api.characters[":id"].contributors.$post({ param: { id: characterId }, json: { email } })),
    onSuccess: () => {
      snackbar.success("Contributor invited");
      queryClient.invalidateQueries({ queryKey: contributorsKey });
      setInviteOpen(false);
    },
    onError: (err) => snackbar.error(err, "Failed to invite contributor"),
  });

  const revokeMutation = useMutation({
    mutationFn: (contributorId: string) =>
      parseResponse(
        rpc.api.characters[":id"].contributors[":contributorId"].$delete({
          param: { id: characterId, contributorId },
        }),
      ),
    onSuccess: () => {
      snackbar.success("Contributor removed");
      queryClient.invalidateQueries({ queryKey: contributorsKey });
      setRemoveTarget(null);
    },
    onError: (err) => snackbar.error(err, "Failed to remove contributor"),
  });

  const leaveMutation = useMutation({
    mutationFn: () => parseResponse(rpc.api.characters[":id"].contributors.leave.$post({ param: { id: characterId } })),
    onSuccess: () => {
      snackbar.success("You have left this character");
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.characters.lists });
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
            <Stack direction="row" spacing={1} sx={{ justifyContent: "space-between", alignItems: "center" }}>
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

            <Stack sx={{ minHeight: { xs: 280, sm: 360 } }}>
              {isLoading ? (
                <DiceSpinner sx={{ flex: 1 }} />
              ) : error ? (
                <LoadError what="Contributors" error={error} />
              ) : contributors.length === 0 && !owner ? (
                <BlankState
                  icon={ContributorsIcon}
                  title="No contributors yet"
                  description={
                    canInvite
                      ? "Invite collaborators to help maintain this character."
                      : "This character has no other contributors."
                  }
                  action={
                    canInvite ? (
                      <Button variant="outlined" startIcon={<AddIcon />} onClick={() => setInviteOpen(true)}>
                        Invite a Contributor
                      </Button>
                    ) : undefined
                  }
                />
              ) : (
                <Stack spacing={2}>
                  <ContributorsTable
                    owner={owner}
                    contributors={contributors}
                    renderActions={
                      isOwner
                        ? (contributor) => (
                            <Tooltip title="Remove">
                              <IconButton
                                aria-label="Remove"
                                size="small"
                                color="error"
                                onClick={() => setRemoveTarget(contributor)}
                              >
                                <DeleteIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                          )
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
            </Stack>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose} variant="outlined" color="inherit">
            Close
          </Button>
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
          message={
            <>
              Are you sure you want to remove{" "}
              <strong>{removeTarget.user?.username || removeTarget.user?.emailAddress || removeTarget.email}</strong> as
              a contributor?
            </>
          }
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
