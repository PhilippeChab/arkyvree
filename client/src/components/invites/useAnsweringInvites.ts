import { useMutationState } from "@tanstack/react-query";

import { QUERY_KEYS } from "@/client/src/lib/queryKeys.ts";
import { isOneOf } from "@/shared/isOneOf.ts";
import { isRecord } from "@/shared/isRecord.ts";

import { INVITE_VERBS, type InviteVerb } from "./inviteKinds.ts";

/**
 * A pending answer's notification and answer, read off its mutation (`useAnswerInvite`'s): its key's last part, its
 * variables' notification.
 */
function pendingAnswerOf(mutationKey: readonly unknown[] | undefined, variables: unknown) {
  const answer = mutationKey?.at(-1);
  const id = isRecord(variables) ? variables.notificationId : undefined;
  return typeof id === "string" && isOneOf(answer, INVITE_VERBS) ? { id, answer } : undefined;
}

/**
 * The answers being sent to invites from their notifications, wherever they were clicked (the bell, the dashboard, the
 * notifications page): `answering(notificationId)`, the answer sent to that one, or none.
 */
export function useAnsweringInvites() {
  const pendingAnswers = useMutationState({
    filters: { mutationKey: QUERY_KEYS.invites.answer, status: "pending" },
    select: (mutation) => pendingAnswerOf(mutation.options.mutationKey, mutation.state.variables),
  });
  return {
    answering: (notificationId: string): InviteVerb | null =>
      pendingAnswers.find((pending) => pending?.id === notificationId)?.answer ?? null,
  };
}
