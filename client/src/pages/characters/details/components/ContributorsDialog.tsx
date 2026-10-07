import { Button, DialogContent, DialogTitle, IconButton, Stack, Tooltip, Typography } from "@mui/material";
import { keepPreviousData, useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { type InferResponseType, parseResponse } from "hono/client";
import { useState } from "react";
import { useNavigate } from "react-router-dom";

import {
  AddButton,
  BlankNote,
  ConfirmDialog,
  DialogFooter,
  DiceSpinner,
  LoadError,
  LoadMoreButton,
  Modal,
} from "@/client/src/components/common/index.ts";
import {
  ContributorsTable,
  EMPTY_INVITE,
  InviteContributorDialog,
  type InviteContributorFormData,
} from "@/client/src/components/contributors/index.ts";
import { DeleteIcon, LeaveIcon } from "@/client/src/components/icons/index.ts";
import { useSnackbar } from "@/client/src/contexts/useSnackbar.ts";
import { useDialogState, useFormWith } from "@/client/src/hooks/index.ts";
import { firstPage, pageItems } from "@/client/src/lib/pageItems.ts";
import { QUERY_KEYS } from "@/client/src/lib/queryKeys.ts";
import { characterContributorsQuery } from "@/client/src/pages/characters/characterQueries.ts";
import { rpc } from "@/client/src/services/rpc.ts";

type Contributor = InferResponseType<(typeof rpc.api.characters)[":id"]["contributors"]["$get"], 200>["items"][number];

interface ContributorsDialogProps {
  characterId: string;
  isArchived: boolean;
  isOwner: boolean;
  onClose: () => void;
  open: boolean;
}

export function ContributorsDialog({ open, onClose, characterId, isOwner, isArchived }: ContributorsDialogProps) {
  const canInvite = isOwner && !isArchived;
  const queryClient = useQueryClient();
  const snackbar = useSnackbar();
  const navigate = useNavigate();

  const [inviteOpen, setInviteOpen] = useState(false);
  const inviteForm = useFormWith<InviteContributorFormData>(EMPTY_INVITE);
  const removeDialog = useDialogState<Contributor>();
  const [leaveConfirmOpen, setLeaveConfirmOpen] = useState(false);

  const contributorsKey = QUERY_KEYS.characters.contributors(characterId);

  const { data, isLoading, error, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteQuery({
    ...characterContributorsQuery(characterId),
    placeholderData: keepPreviousData,
    enabled: open,
  });

  const contributors = pageItems(data);
  const owner = firstPage(data)?.owner ?? null;

  // Opened empty, whatever a cancelled one held
  const handleInvite = () => {
    inviteForm.reset();
    setInviteOpen(true);
  };

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
      removeDialog.close();
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
                <AddButton label="Invite" onClick={handleInvite} />
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
                <DiceSpinner sx={{ py: 4 }} />
              ) : error && !data ? (
                <LoadError what="Contributors" error={error} />
              ) : contributors.length === 0 && !owner ? (
                <Stack spacing={2} sx={{ alignItems: "flex-start" }}>
                  <BlankNote>No contributors yet</BlankNote>
                  {canInvite && <AddButton variant="outlined" label="Invite a Contributor" onClick={handleInvite} />}
                </Stack>
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
                                onClick={() => removeDialog.openWith(contributor)}
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
        <DialogFooter onCancel={onClose} cancelLabel="Close" />
      </Modal>

      <InviteContributorDialog
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        form={inviteForm}
        onSubmit={({ email }) => inviteMutation.mutate(email)}
        isLoading={inviteMutation.isPending}
      />

      <ConfirmDialog
        open={removeDialog.open}
        onClose={removeDialog.close}
        onConfirm={() => removeDialog.target && revokeMutation.mutate(removeDialog.target.id)}
        isLoading={revokeMutation.isPending}
        title="Remove Contributor"
        message={
          <>
            Are you sure you want to remove{" "}
            <strong>
              {removeDialog.target?.user?.username ||
                removeDialog.target?.user?.emailAddress ||
                removeDialog.target?.email}
            </strong>{" "}
            as a contributor?
          </>
        }
        confirmLabel="Remove"
        confirmColor="error"
        maxWidth="xs"
      />

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
