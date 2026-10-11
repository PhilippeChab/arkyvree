import { keepPreviousData, useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";

import { useSnackbar } from "@/client/src/contexts/useSnackbar.ts";
import { useDialogState, useFormWith } from "@/client/src/hooks/index.ts";
import { firstPage, pageItems } from "@/client/src/lib/pageItems.ts";

import { type Contributor, CONTRIBUTOR_KINDS, type ContributorKind } from "./contributorKinds.ts";
import { contributorsQuery } from "./contributorsQueries.ts";
import { EMPTY_INVITE } from "./emptyForms.ts";
import type { InviteContributorFormData } from "./InviteContributorDialog.tsx";

/**
 * A ruleset's or a character's contributors (asked for while `enabled`: its dialog is open), and inviting, removing
 * and leaving, each with its dialog, in one wording whatever the kind (`CONTRIBUTOR_KINDS`).
 */
export function useContributors(kind: ContributorKind, id: string, enabled: boolean) {
  const queryClient = useQueryClient();
  const snackbar = useSnackbar();
  const navigate = useNavigate();
  const { noun, listKey, listPath, inviteFn, removeFn, leaveFn } = CONTRIBUTOR_KINDS[kind];
  const query = contributorsQuery(kind, id);

  const inviteDialog = useDialogState();
  const inviteForm = useFormWith<InviteContributorFormData>(EMPTY_INVITE);
  const removeDialog = useDialogState<Contributor>();
  const leaveDialog = useDialogState();

  const { data, isLoading, error, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteQuery({
    ...query,
    placeholderData: keepPreviousData,
    enabled,
  });

  // Opened empty, whatever a cancelled one held
  const openInvite = () => {
    inviteForm.reset();
    inviteDialog.openWith(true);
  };

  const inviteMutation = useMutation({
    mutationFn: async (invite: InviteContributorFormData) => {
      await inviteFn(id, invite);
    },
    onSuccess: () => {
      snackbar.success("Contributor invited");
      void queryClient.invalidateQueries({ queryKey: query.queryKey });
      inviteDialog.close();
    },
    onError: (error) => snackbar.error(error, "Failed to invite contributor"),
  });

  const removeMutation = useMutation({
    mutationFn: async (contributorId: string) => {
      await removeFn(id, contributorId);
    },
    onSuccess: () => {
      snackbar.success("Contributor removed");
      void queryClient.invalidateQueries({ queryKey: query.queryKey });
      removeDialog.close();
    },
    onError: (error) => snackbar.error(error, "Failed to remove contributor"),
  });

  // Gone from the record: its list no longer holds it, and its page sends the user back to that list
  const leaveMutation = useMutation({
    mutationFn: async () => {
      await leaveFn(id);
    },
    onSuccess: () => {
      snackbar.success(`You left the ${noun}`);
      void queryClient.invalidateQueries({ queryKey: listKey });
      leaveDialog.close();
      navigate(listPath);
    },
    onError: (error) => snackbar.error(error, `Failed to leave ${noun}`),
  });

  return {
    contributors: pageItems<Contributor>(data),
    owner: firstPage(data)?.owner ?? null,
    isLoading,
    error,
    hasData: !!data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    inviteDialog,
    inviteForm,
    openInvite,
    inviteMutation,
    removeDialog,
    removeMutation,
    leaveDialog,
    leaveMutation,
  };
}
