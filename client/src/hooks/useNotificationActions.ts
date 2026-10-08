import { useMutation, useMutationState, useQueryClient } from "@tanstack/react-query";
import { type InferResponseType, parseResponse } from "hono/client";
import { useNavigate } from "react-router-dom";

import { useSnackbar } from "@/client/src/contexts/useSnackbar.ts";
import { saveBlob } from "@/client/src/lib/download.ts";
import { acceptedPath, ANSWER_INVITE_KEY } from "@/client/src/lib/invites.ts";
import { QUERY_KEYS } from "@/client/src/lib/queryKeys.ts";
import { ApiError } from "@/client/src/services/ApiError.ts";
import { rpc } from "@/client/src/services/rpc.ts";
import { isNavigableTarget } from "@/shared/activity.ts";
import { isRecord } from "@/shared/isRecord.ts";

import { useAnswerInvite } from "./useAnswerInvite.ts";
import { useOpenActivityTarget } from "./useOpenActivityTarget.ts";

type InviteType = keyof typeof NOTIFICATION_INVITES;

type NotificationData = Record<string, string | undefined>;

type NotificationItem = InferResponseType<typeof rpc.api.notifications.$get, 200>["items"][number];

/** Fields the actions use; the bell's unread-summary items carry them too. */
type NotificationLike = Pick<NotificationItem, "id" | "type" | "targetTable" | "targetId" | "data" | "readAt">;

/**
 * Notification types that are invitations, answered in place with Accept / Reject (`useAnswerInvite`): `targetId` is
 * the invite, of `kind`; its payload's `entityKey` names the entity accepting takes the user to (`acceptedPath`).
 */
const NOTIFICATION_INVITES = {
  createCampaignInvite: { kind: "campaign", entityKey: "campaignId" },
  inviteContributor: { kind: "rulesetContributor", entityKey: "rulesetId" },
  inviteCharacterContributor: { kind: "characterContributor", entityKey: "characterId" },
} as const;

function isInviteType(type: string): type is InviteType {
  return type in NOTIFICATION_INVITES;
}

/** A notification's payload: its string fields (ids, names); anything else is left out. */
function notificationData(n: NotificationLike): NotificationData {
  return isRecord(n.data)
    ? Object.fromEntries(
        Object.entries(n.data).filter((entry): entry is [string, string] => typeof entry[1] === "string"),
      )
    : {};
}

/** A pending answer's notification and answer, read off its mutation: its key's last part, its variables' notification. */
function pendingAnswerOf(
  mutationKey: readonly unknown[] | undefined,
  variables: unknown,
): { answer: "accept" | "reject"; id: string } | undefined {
  const answer = mutationKey?.at(-1);
  const id = isRecord(variables) ? variables.notificationId : undefined;
  return typeof id === "string" && (answer === "accept" || answer === "reject") ? { id, answer } : undefined;
}

/**
 * What a user can do with a notification, shared by the bell, the dashboard card and the notifications page: answer an
 * invite, download a ready PDF, or open the entity the notification is about.
 */
export function useNotificationActions() {
  const queryClient = useQueryClient();
  const snackbar = useSnackbar();
  const navigate = useNavigate();
  const openTarget = useOpenActivityTarget();

  const invalidateNotifications = () => queryClient.invalidateQueries({ queryKey: QUERY_KEYS.notifications.all });

  // Best-effort: failing to mark read (already read, or gone) must not block what the user clicked. Refetch either way
  // to show the current state.
  const markRead = useMutation({
    mutationFn: (notificationId: string) =>
      parseResponse(rpc.api.notifications[":id"].read.$post({ param: { id: notificationId } })),
    onSettled: invalidateNotifications,
  });

  const markAllRead = useMutation({
    mutationFn: () => parseResponse(rpc.api.notifications["read-all"].$post()),
    onSuccess: invalidateNotifications,
    onError: (error) => snackbar.error(error, "Failed to mark all notifications as read"),
  });

  // An invite answered or revoked elsewhere: its notification stops offering it
  const answers = useAnswerInvite(({ notificationId }) => {
    if (notificationId) markRead.mutate(notificationId);
  });

  const pendingAnswers = useMutationState({
    filters: { mutationKey: ANSWER_INVITE_KEY, status: "pending" },
    select: (mutation) => pendingAnswerOf(mutation.options.mutationKey, mutation.state.variables),
  });

  const isActionable = (n: NotificationLike) => isInviteType(n.type) && !n.readAt;

  /** The answer being sent to this invite right now, if any. */
  const answering = (n: NotificationLike) => pendingAnswers.find((pending) => pending?.id === n.id)?.answer ?? null;

  const isDownloadable = (n: NotificationLike) => n.type === "pdfReady";

  /**
   * Whether clicking the notification does anything: download, open its
   * target, or at least mark it read. Invites use their buttons instead.
   */
  const isOpenable = (n: NotificationLike) =>
    !isActionable(n) && (isDownloadable(n) || isNavigableTarget(n.targetTable) || !n.readAt);

  // The export is gone: past its lifetime (a 404), or one its notification doesn't name
  const exportExpired = () => snackbar.warning("This export expired: generate a new one");

  const download = useMutation({
    // A file: its body is a blob, never JSON
    mutationFn: async ({ exportId }: { exportId: string; fileName: string }) =>
      (await rpc.api.exports[":id"].download.$get({ param: { id: exportId } })).blob(),
    onSuccess: (blob, { fileName }) => saveBlob(blob, fileName),
    onError: (error) => {
      if (error instanceof ApiError && error.status === 404) exportExpired();
      else snackbar.error(error, "Failed to download export");
    },
  });

  const downloadExport = (n: NotificationLike) => {
    markRead.mutate(n.id);
    const { exportId, fileName } = notificationData(n);
    if (!exportId) {
      exportExpired();
      return;
    }
    download.mutate({ exportId, fileName: fileName || "export.pdf" });
  };

  /** Download a ready export, or open the entity the notification is about. */
  const open = (n: NotificationLike) => {
    if (isDownloadable(n)) {
      downloadExport(n);
      return;
    }
    if (!n.readAt) markRead.mutate(n.id);
    if (isNavigableTarget(n.targetTable)) openTarget(n.targetTable, n.targetId);
  };

  const accept = (n: NotificationLike, onAccepted: (path: string) => void = navigate) => {
    if (!isInviteType(n.type)) return;
    const { kind, entityKey } = NOTIFICATION_INVITES[n.type];
    answers.accept.mutate(
      { kind, inviteId: n.targetId, notificationId: n.id },
      { onSuccess: () => onAccepted(acceptedPath(kind, notificationData(n)[entityKey])) },
    );
  };

  const reject = (n: NotificationLike) => {
    if (!isInviteType(n.type)) return;
    answers.reject.mutate({ kind: NOTIFICATION_INVITES[n.type].kind, inviteId: n.targetId, notificationId: n.id });
  };

  return {
    isActionable,
    isOpenable,
    open,
    accept,
    reject,
    answering,
    markAllRead,
  };
}
