import { useMutation, useQueryClient } from "@tanstack/react-query";

import { useSnackbar } from "@/client/src/contexts/useSnackbar.ts";
import { ANSWER_INVITE_KEY, INVITE_KINDS, type InviteAnswer } from "@/client/src/lib/invites.ts";
import { QUERY_KEYS } from "@/client/src/lib/queryKeys.ts";
import { ApiError } from "@/client/src/services/ApiError.ts";

/**
 * Accepting and rejecting an invite, one way wherever it's answered (a notification's buttons, the invite's own page):
 * its toasts, what it refreshes, and an invite no longer pending (answered or revoked elsewhere: a 409), which
 * `onNoLongerPending` stops offering while the invites and notifications refresh.
 */
export function useAnswerInvite(onNoLongerPending?: (answer: InviteAnswer) => void) {
  const queryClient = useQueryClient();
  const snackbar = useSnackbar();

  // Answering marks the invite's notification read server-side
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.notifications.all });
    void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.invites.all });
  };

  const handleError = (verb: "accept" | "reject") => (error: Error, answer: InviteAnswer) => {
    if (error instanceof ApiError && error.status === 409) {
      snackbar.warning("This invitation is no longer pending");
      refresh();
      onNoLongerPending?.(answer);
      return;
    }
    // Still pending: its buttons stay, so the user can retry
    snackbar.error(error, `Failed to ${verb} invitation`);
  };

  const accept = useMutation({
    mutationKey: [...ANSWER_INVITE_KEY, "accept"],
    mutationFn: async ({ kind, inviteId }: InviteAnswer) => {
      await INVITE_KINDS[kind].acceptFn(inviteId);
    },
    onSuccess: (_, { kind }) => {
      snackbar.success(`${INVITE_KINDS[kind].label} accepted`);
      void queryClient.invalidateQueries({ queryKey: INVITE_KINDS[kind].listKey });
      refresh();
    },
    onError: handleError("accept"),
  });

  const reject = useMutation({
    mutationKey: [...ANSWER_INVITE_KEY, "reject"],
    mutationFn: async ({ kind, inviteId }: InviteAnswer) => {
      await INVITE_KINDS[kind].rejectFn(inviteId);
    },
    onSuccess: (_, { kind }) => {
      snackbar.success(`${INVITE_KINDS[kind].label} rejected`);
      refresh();
    },
    onError: handleError("reject"),
  });

  return { accept, reject };
}
