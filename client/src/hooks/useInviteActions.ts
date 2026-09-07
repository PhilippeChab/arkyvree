import { useSnackbar } from "@/client/src/contexts/ToastContext.tsx";
import { queryKeys } from "@/client/src/lib/queryKeys.ts";
import { rpc, ApiError } from "@/client/src/services/rpc.ts";
import { useMutation, useQueryClient } from "@tanstack/react-query";

type InviteAction = { inviteId: string; notificationId: string };

export function useInviteActions() {
  const snackbar = useSnackbar();
  const queryClient = useQueryClient();

  const invalidateNotifications = () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.notifications.all });
  };

  const markNotificationRead = async (notificationId: string) => {
    try {
      await rpc.api.notifications[":id"].read.$post({ param: { id: notificationId } });
      invalidateNotifications();
    } catch {
      // Best-effort — don't block the action
    }
  };

  const handleError = (error: unknown, notificationId: string) => {
    if (error instanceof ApiError && error.status === 409) {
      snackbar.warning("This invitation is no longer pending");
    } else {
      snackbar.error(error, "Failed to process invitation");
    }
    // Mark read anyway since the invite is resolved
    markNotificationRead(notificationId);
    invalidateNotifications();
  };

  const acceptCampaignInvite = useMutation({
    mutationFn: async ({ inviteId }: InviteAction) => {
      const response = await rpc.api.campaigns.invites[":inviteId"].accept.$post({
        param: { inviteId },
      });
      if (!response.ok) {
        const data = await response.json();
        throw new ApiError(
          "error" in data ? data.message : "Failed to accept invite",
          response.status,
          "error" in data ? data.error : "UnknownError",
        );
      }
      return response.json();
    },
    onSuccess: (_, { notificationId }) => {
      snackbar.success("Campaign invite accepted!");
      queryClient.invalidateQueries({ queryKey: queryKeys.campaigns.lists });
      markNotificationRead(notificationId);
      invalidateNotifications();
    },
    onError: (error, { notificationId }) => handleError(error, notificationId),
  });

  const rejectCampaignInvite = useMutation({
    mutationFn: async ({ inviteId }: InviteAction) => {
      const response = await rpc.api.campaigns.invites[":inviteId"].reject.$post({
        param: { inviteId },
      });
      if (!response.ok) {
        const data = await response.json();
        throw new ApiError(
          "error" in data ? data.message : "Failed to reject invite",
          response.status,
          "error" in data ? data.error : "UnknownError",
        );
      }
    },
    onSuccess: (_, { notificationId }) => {
      snackbar.success("Campaign invite rejected");
      markNotificationRead(notificationId);
      invalidateNotifications();
    },
    onError: (error, { notificationId }) => handleError(error, notificationId),
  });

  const acceptContributorInvite = useMutation({
    mutationFn: async ({ inviteId }: InviteAction) => {
      const response = await rpc.api.rulesets.contributors.invites[":id"].accept.$post({
        param: { id: inviteId },
      });
      if (!response.ok) {
        const data = await response.json();
        throw new ApiError(
          "error" in data ? data.message : "Failed to accept invite",
          response.status,
          "error" in data ? data.error : "UnknownError",
        );
      }
      return response.json();
    },
    onSuccess: (_, { notificationId }) => {
      snackbar.success("Contributor invite accepted!");
      queryClient.invalidateQueries({ queryKey: queryKeys.rulesets.lists });
      markNotificationRead(notificationId);
      invalidateNotifications();
    },
    onError: (error, { notificationId }) => handleError(error, notificationId),
  });

  const rejectContributorInvite = useMutation({
    mutationFn: async ({ inviteId }: InviteAction) => {
      const response = await rpc.api.rulesets.contributors.invites[":id"].reject.$post({
        param: { id: inviteId },
      });
      if (!response.ok) {
        const data = await response.json();
        throw new ApiError(
          "error" in data ? data.message : "Failed to reject invite",
          response.status,
          "error" in data ? data.error : "UnknownError",
        );
      }
    },
    onSuccess: (_, { notificationId }) => {
      snackbar.success("Contributor invite rejected");
      markNotificationRead(notificationId);
      invalidateNotifications();
    },
    onError: (error, { notificationId }) => handleError(error, notificationId),
  });

  const acceptCharacterContributorInvite = useMutation({
    mutationFn: async ({ inviteId }: InviteAction) => {
      const response = await rpc.api.characters.contributors.invites[":id"].accept.$post({
        param: { id: inviteId },
      });
      if (!response.ok) {
        const data = await response.json();
        throw new ApiError(
          "error" in data ? data.message : "Failed to accept invite",
          response.status,
          "error" in data ? data.error : "UnknownError",
        );
      }
      return response.json();
    },
    onSuccess: (_, { notificationId }) => {
      snackbar.success("Contributor invite accepted!");
      queryClient.invalidateQueries({ queryKey: queryKeys.characters.lists });
      markNotificationRead(notificationId);
      invalidateNotifications();
    },
    onError: (error, { notificationId }) => handleError(error, notificationId),
  });

  const rejectCharacterContributorInvite = useMutation({
    mutationFn: async ({ inviteId }: InviteAction) => {
      const response = await rpc.api.characters.contributors.invites[":id"].reject.$post({
        param: { id: inviteId },
      });
      if (!response.ok) {
        const data = await response.json();
        throw new ApiError(
          "error" in data ? data.message : "Failed to reject invite",
          response.status,
          "error" in data ? data.error : "UnknownError",
        );
      }
    },
    onSuccess: (_, { notificationId }) => {
      snackbar.success("Contributor invite rejected");
      markNotificationRead(notificationId);
      invalidateNotifications();
    },
    onError: (error, { notificationId }) => handleError(error, notificationId),
  });

  const isPending =
    acceptCampaignInvite.isPending ||
    rejectCampaignInvite.isPending ||
    acceptContributorInvite.isPending ||
    rejectContributorInvite.isPending ||
    acceptCharacterContributorInvite.isPending ||
    rejectCharacterContributorInvite.isPending;

  const acceptInvite = (
    notification: { id: string; targetId: string; type: string; data: unknown },
    onNavigate?: (url: string) => void,
  ) => {
    const d = (notification.data ?? {}) as Record<string, unknown>;
    const args = { inviteId: notification.targetId, notificationId: notification.id };

    if (notification.type === "createCampaignInvite") {
      acceptCampaignInvite.mutate(args, {
        onSuccess: () => {
          const campaignId = d.campaignId as string | undefined;
          onNavigate?.(campaignId ? `/campaigns/${campaignId}` : "/campaigns");
        },
      });
    } else if (notification.type === "inviteContributor") {
      acceptContributorInvite.mutate(args, {
        onSuccess: () => {
          const rulesetId = d.rulesetId as string | undefined;
          onNavigate?.(rulesetId ? `/rulesets/${rulesetId}` : "/rulesets");
        },
      });
    } else if (notification.type === "inviteCharacterContributor") {
      acceptCharacterContributorInvite.mutate(args, {
        onSuccess: () => {
          const characterId = d.characterId as string | undefined;
          onNavigate?.(characterId ? `/characters/${characterId}` : "/characters");
        },
      });
    }
  };

  const rejectInvite = (
    notification: { id: string; targetId: string; type: string },
  ) => {
    const args = { inviteId: notification.targetId, notificationId: notification.id };

    if (notification.type === "createCampaignInvite") {
      rejectCampaignInvite.mutate(args);
    } else if (notification.type === "inviteContributor") {
      rejectContributorInvite.mutate(args);
    } else if (notification.type === "inviteCharacterContributor") {
      rejectCharacterContributorInvite.mutate(args);
    }
  };

  return {
    acceptInvite,
    rejectInvite,
    markNotificationRead,
    isPending,
  };
}
