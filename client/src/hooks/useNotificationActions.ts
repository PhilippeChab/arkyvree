import { useMutation, useMutationState, useQueryClient } from "@tanstack/react-query";
import { type InferResponseType, parseResponse } from "hono/client";
import { useNavigate } from "react-router-dom";

import { useSnackbar } from "@/client/src/contexts/useSnackbar.ts";
import { saveBlob } from "@/client/src/lib/download.ts";
import { QUERY_KEYS } from "@/client/src/lib/queryKeys.ts";
import { ApiError } from "@/client/src/services/ApiError.ts";
import { rpc } from "@/client/src/services/rpc.ts";
import { isRecord } from "@/shared/isRecord.ts";

import { isNavigableTarget, useOpenActivityTarget } from "./useOpenActivityTarget.ts";

interface InviteAnswer {
  notification: NotificationLike;
  type: InviteType;
}
type InviteType = keyof typeof INVITES;

type NotificationData = Record<string, string | undefined>;

type NotificationItem = InferResponseType<typeof rpc.api.notifications.$get, 200>["items"][number];

/** Fields the actions use; the bell's unread-summary items carry them too. */
type NotificationLike = Pick<NotificationItem, "id" | "type" | "targetTable" | "targetId" | "data" | "readAt">;

/**
 * Shared by accept and reject, so every notification surface can tell which invites are being answered, whichever
 * surface the click came from.
 */
const ANSWER_INVITE_KEY = ["notifications", "answerInvite"] as const;

/**
 * Notification types that are invitations, answered in place with Accept /
 * Reject. `targetId` is the invite; `path` is where accepting takes the user.
 */
const INVITES = {
  createCampaignInvite: {
    label: "Campaign invite",
    acceptFn: (id: string) =>
      parseResponse(rpc.api.campaigns.invites[":inviteId"].accept.$post({ param: { inviteId: id } })),
    rejectFn: (id: string) =>
      parseResponse(rpc.api.campaigns.invites[":inviteId"].reject.$post({ param: { inviteId: id } })),
    listKey: QUERY_KEYS.campaigns.lists,
    path: (d: NotificationData) => (d.campaignId ? `/campaigns/${d.campaignId}` : "/campaigns"),
  },
  inviteContributor: {
    label: "Contributor invite",
    acceptFn: (id: string) =>
      parseResponse(rpc.api.rulesets.contributors.invites[":id"].accept.$post({ param: { id } })),
    rejectFn: (id: string) =>
      parseResponse(rpc.api.rulesets.contributors.invites[":id"].reject.$post({ param: { id } })),
    listKey: QUERY_KEYS.rulesets.lists,
    path: (d: NotificationData) => (d.rulesetId ? `/rulesets/${d.rulesetId}` : "/rulesets"),
  },
  inviteCharacterContributor: {
    label: "Contributor invite",
    acceptFn: (id: string) =>
      parseResponse(rpc.api.characters.contributors.invites[":id"].accept.$post({ param: { id } })),
    rejectFn: (id: string) =>
      parseResponse(rpc.api.characters.contributors.invites[":id"].reject.$post({ param: { id } })),
    listKey: QUERY_KEYS.characters.lists,
    path: (d: NotificationData) => (d.characterId ? `/characters/${d.characterId}` : "/characters"),
  },
} as const;

function isInviteType(type: string): type is InviteType {
  return type in INVITES;
}

/** A notification's payload: its string fields (ids, names); anything else is left out. */
function notificationData(n: NotificationLike): NotificationData {
  return isRecord(n.data)
    ? Object.fromEntries(
        Object.entries(n.data).filter((entry): entry is [string, string] => typeof entry[1] === "string"),
      )
    : {};
}

/**
 * What a user can do with a notification, shared by the bell, the dashboard
 * card and the notifications page: answer an invite, download a ready PDF, or
 * open the entity the notification is about.
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

  const handleInviteError = (error: unknown, notification: NotificationLike) => {
    if (error instanceof ApiError && error.status === 409) {
      snackbar.warning("This invitation is no longer pending");
      // Answered or revoked elsewhere: stop offering it.
      markRead.mutate(notification.id);
    } else {
      // Still pending: keep Accept / Reject so the user can retry.
      snackbar.error(error, "Failed to process invitation");
    }
  };

  const acceptMutation = useMutation({
    mutationKey: ANSWER_INVITE_KEY,
    mutationFn: async ({ notification, type }: InviteAnswer) => {
      await INVITES[type].acceptFn(notification.targetId);
    },
    // Answering marks the invite's notification read server-side.
    onSuccess: (_, { type }) => {
      snackbar.success(`${INVITES[type].label} accepted`);
      queryClient.invalidateQueries({ queryKey: INVITES[type].listKey });
      void invalidateNotifications();
    },
    onError: (error, { notification }) => handleInviteError(error, notification),
  });

  const rejectMutation = useMutation({
    mutationKey: ANSWER_INVITE_KEY,
    mutationFn: async ({ notification, type }: InviteAnswer) => {
      await INVITES[type].rejectFn(notification.targetId);
    },
    onSuccess: (_, { type }) => {
      snackbar.success(`${INVITES[type].label} rejected`);
      void invalidateNotifications();
    },
    onError: (error, { notification }) => handleInviteError(error, notification),
  });

  const answeringIds = useMutationState({
    filters: { mutationKey: ANSWER_INVITE_KEY, status: "pending" },
    select: (mutation) => (mutation.state.variables as InviteAnswer).notification.id,
  });

  const isActionable = (n: NotificationLike) => isInviteType(n.type) && !n.readAt;

  /** Whether this invite is being accepted or rejected right now. */
  const isAnswering = (n: NotificationLike) => answeringIds.includes(n.id);

  const isDownloadable = (n: NotificationLike) => n.type === "pdfReady";

  /**
   * Whether clicking the notification does anything: download, open its
   * target, or at least mark it read. Invites use their buttons instead.
   */
  const isOpenable = (n: NotificationLike) =>
    !isActionable(n) && (isDownloadable(n) || isNavigableTarget(n.targetTable) || !n.readAt);

  const download = useMutation({
    // A file: its body is a blob, never JSON
    mutationFn: async ({ exportId }: { exportId: string; fileName: string }) =>
      (await rpc.api.exports[":id"].download.$get({ param: { id: exportId } })).blob(),
    onSuccess: (blob, { fileName }) => saveBlob(blob, fileName),
    onError: (error) => {
      if (error instanceof ApiError && error.status === 404)
        snackbar.warning("This export expired: generate a new one");
      else snackbar.error(error, "Failed to download export");
    },
  });

  const downloadExport = (n: NotificationLike) => {
    markRead.mutate(n.id);
    const { exportId, fileName } = notificationData(n);
    if (!exportId) {
      snackbar.error("Download link is no longer available");
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
    const type = n.type;
    acceptMutation.mutate(
      { notification: n, type },
      {
        onSuccess: () => onAccepted(INVITES[type].path(notificationData(n))),
      },
    );
  };

  const reject = (n: NotificationLike) => {
    if (!isInviteType(n.type)) return;
    rejectMutation.mutate({ notification: n, type: n.type });
  };

  return {
    isActionable,
    isOpenable,
    open,
    accept,
    reject,
    isAnswering,
    markAllRead,
  };
}
