import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";

import { useSnackbar } from "@/client/src/contexts/ToastContext.tsx";
import { saveBlob } from "@/client/src/lib/download.ts";
import { queryKeys } from "@/client/src/lib/queryKeys.ts";
import { ApiError, rpc } from "@/client/src/services/rpc.ts";
import { isNavigableTarget, useOpenActivityTarget } from "./useOpenActivityTarget.ts";

interface NotificationLike {
  id: string;
  type: string;
  targetTable: string;
  targetId: string;
  data: unknown;
  readAt: string | null;
}

type NotificationData = Record<string, string | undefined>;

// Notification types that are invitations, answered in place with Accept /
// Reject. `targetId` is the invite; `path` is where accepting takes the user.
const INVITES = {
  createCampaignInvite: {
    label: "Campaign invite",
    accept: (id: string) => rpc.api.campaigns.invites[":inviteId"].accept.$post({ param: { inviteId: id } }),
    reject: (id: string) => rpc.api.campaigns.invites[":inviteId"].reject.$post({ param: { inviteId: id } }),
    listKey: queryKeys.campaigns.lists,
    path: (d: NotificationData) => (d.campaignId ? `/campaigns/${d.campaignId}` : "/campaigns"),
  },
  inviteContributor: {
    label: "Contributor invite",
    accept: (id: string) => rpc.api.rulesets.contributors.invites[":id"].accept.$post({ param: { id } }),
    reject: (id: string) => rpc.api.rulesets.contributors.invites[":id"].reject.$post({ param: { id } }),
    listKey: queryKeys.rulesets.lists,
    path: (d: NotificationData) => (d.rulesetId ? `/rulesets/${d.rulesetId}` : "/rulesets"),
  },
  inviteCharacterContributor: {
    label: "Contributor invite",
    accept: (id: string) => rpc.api.characters.contributors.invites[":id"].accept.$post({ param: { id } }),
    reject: (id: string) => rpc.api.characters.contributors.invites[":id"].reject.$post({ param: { id } }),
    listKey: queryKeys.characters.lists,
    path: (d: NotificationData) => (d.characterId ? `/characters/${d.characterId}` : "/characters"),
  },
} as const;

type InviteType = keyof typeof INVITES;

const isInviteType = (type: string): type is InviteType => type in INVITES;

const notificationData = (n: NotificationLike) => (n.data ?? {}) as NotificationData;

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

  const invalidateNotifications = () =>
    queryClient.invalidateQueries({ queryKey: queryKeys.notifications.all });

  // Best-effort: failing to mark read must not block what the user clicked.
  // Answering an invite already marks its notification read server-side, so
  // this request can 404 — refetch either way to show the current state.
  const markRead = async (notificationId: string) => {
    try {
      await rpc.api.notifications[":id"].read.$post({ param: { id: notificationId } });
    } catch {
      // Already read, or gone.
    } finally {
      void invalidateNotifications();
    }
  };

  const markAllRead = useMutation({
    mutationFn: () => rpc.api.notifications["read-all"].$post(),
    onSuccess: invalidateNotifications,
    onError: (error) => snackbar.error(error, "Failed to mark all notifications as read"),
  });

  const handleInviteError = (error: unknown, notification: NotificationLike) => {
    if (error instanceof ApiError && error.status === 409) {
      snackbar.warning("This invitation is no longer pending");
    } else {
      snackbar.error(error, "Failed to process invitation");
    }
    // The invite is resolved one way or another; stop offering it.
    void markRead(notification.id);
  };

  const acceptMutation = useMutation({
    mutationFn: async ({ notification, type }: { notification: NotificationLike; type: InviteType }) => {
      await INVITES[type].accept(notification.targetId);
    },
    onSuccess: (_, { notification, type }) => {
      snackbar.success(`${INVITES[type].label} accepted!`);
      queryClient.invalidateQueries({ queryKey: INVITES[type].listKey });
      void markRead(notification.id);
    },
    onError: (error, { notification }) => handleInviteError(error, notification),
  });

  const rejectMutation = useMutation({
    mutationFn: async ({ notification, type }: { notification: NotificationLike; type: InviteType }) => {
      await INVITES[type].reject(notification.targetId);
    },
    onSuccess: (_, { notification, type }) => {
      snackbar.success(`${INVITES[type].label} rejected`);
      void markRead(notification.id);
    },
    onError: (error, { notification }) => handleInviteError(error, notification),
  });

  const isActionable = (n: NotificationLike) => isInviteType(n.type) && !n.readAt;

  const isDownloadable = (n: NotificationLike) => n.type === "pdfReady";

  /** Whether clicking the notification does anything (invites use their buttons instead). */
  const isOpenable = (n: NotificationLike) =>
    !isActionable(n) && (isDownloadable(n) || isNavigableTarget(n.targetTable));

  const downloadExport = async (n: NotificationLike) => {
    void markRead(n.id);
    const { exportId, fileName } = notificationData(n);
    if (!exportId) {
      snackbar.error("Download link is no longer available");
      return;
    }
    try {
      const response = await rpc.api.exports[":id"].download.$get({ param: { id: exportId } });
      saveBlob(await response.blob(), fileName || "export.pdf");
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) {
        snackbar.warning("This export has expired. Please generate a new one.");
      } else {
        snackbar.error(error, "Failed to download export");
      }
    }
  };

  /** Download a ready export, or open the entity the notification is about. */
  const open = (n: NotificationLike) => {
    if (isDownloadable(n)) {
      void downloadExport(n);
      return;
    }
    if (!n.readAt) void markRead(n.id);
    if (isNavigableTarget(n.targetTable)) void openTarget(n.targetTable, n.targetId);
  };

  const accept = (n: NotificationLike, onAccepted: (path: string) => void = navigate) => {
    if (!isInviteType(n.type)) return;
    const type = n.type;
    acceptMutation.mutate({ notification: n, type }, {
      onSuccess: () => onAccepted(INVITES[type].path(notificationData(n))),
    });
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
    isInvitePending: acceptMutation.isPending || rejectMutation.isPending,
    markAllRead,
  };
}
