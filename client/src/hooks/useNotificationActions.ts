import { useMutation, useQueryClient } from "@tanstack/react-query";
import { type InferResponseType, parseResponse } from "hono/client";
import { useNavigate } from "react-router-dom";

import {
  acceptedPath,
  type InviteKind,
  useAnsweringInvites,
  useAnswerInvite,
} from "@/client/src/components/invites/index.ts";
import { useSnackbar } from "@/client/src/contexts/useSnackbar.ts";
import { saveBlob } from "@/client/src/lib/download.ts";
import { QUERY_KEYS } from "@/client/src/lib/queryKeys.ts";
import { ApiError } from "@/client/src/services/ApiError.ts";
import { rpc } from "@/client/src/services/rpc.ts";
import { INVITE_NOTIFICATION_TYPES, type InviteNotificationType, isNavigableTarget } from "@/shared/activity.ts";
import { isOneOf } from "@/shared/isOneOf.ts";
import { isRecord } from "@/shared/isRecord.ts";

import { useOpenActivityTarget } from "./useOpenActivityTarget.ts";

type NotificationData = Record<string, string | undefined>;

type NotificationItem = InferResponseType<typeof rpc.api.notifications.$get, 200>["items"][number];

/** Fields the actions use; the bell's unread-summary items carry them too. */
type NotificationLike = Pick<
  NotificationItem,
  "id" | "type" | "targetType" | "targetId" | "data" | "readAt" | "inviteAnswers"
>;

/**
 * Each invite's notification (`INVITE_NOTIFICATION_TYPES`), answered in place with Accept / Reject (`useAnswerInvite`),
 * as its answers say (`inviteAnswers`): `targetId` is the invite, of `kind`; its payload's `entityKey` names the entity
 * accepting takes the user to (`acceptedPath`).
 */
const NOTIFICATION_INVITES = {
  createCampaignInvite: { kind: "campaign", entityKey: "campaignId" },
  inviteContributor: { kind: "rulesetContributor", entityKey: "rulesetId" },
  inviteCharacterContributor: { kind: "characterContributor", entityKey: "characterId" },
} as const satisfies Record<InviteNotificationType, { entityKey: string; kind: InviteKind }>;

function isInviteType(type: string): type is InviteNotificationType {
  return isOneOf(type, INVITE_NOTIFICATION_TYPES);
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

  // An invite the server refuses for good: its notification stops offering it
  const answers = useAnswerInvite(({ notificationId }) => {
    if (notificationId) markRead.mutate(notificationId);
  });

  const { answering: answeringNotification } = useAnsweringInvites();

  /** Whether its invite may still be answered, as the server answers it: its Reject at least. */
  const isActionable = (n: NotificationLike) => !!n.inviteAnswers?.canReject;

  /** The answer being sent to this invite right now, if any. */
  const answering = (n: NotificationLike) => answeringNotification(n.id);

  const isDownloadable = (n: NotificationLike) => n.type === "pdfReady";

  /**
   * Whether clicking the notification does anything: download, open its
   * target, or at least mark it read. Invites use their buttons instead.
   */
  const isOpenable = (n: NotificationLike) =>
    !isActionable(n) && (isDownloadable(n) || isNavigableTarget(n.targetType) || !n.readAt);

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
    if (isNavigableTarget(n.targetType)) openTarget(n.targetType, n.targetId, n.data);
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

  /**
   * An invite's buttons (`InviteActionButtons`), as its notification's answers say, while it may be answered
   * (`isActionable`): its Accept while it may be accepted, landing where `onAccepted` goes (its record's page unless the
   * caller goes there its own way), else why not (`refusal`), beside its Reject.
   */
  const inviteButtons = (n: NotificationLike, onAccepted?: (path: string) => void) => ({
    onAccept: n.inviteAnswers?.canAccept ? () => accept(n, onAccepted) : undefined,
    onReject: () => reject(n),
    pending: answering(n),
    refusal: n.inviteAnswers?.acceptRefusal,
  });

  return {
    inviteButtons,
    isActionable,
    isOpenable,
    open,
    markAllRead,
  };
}
