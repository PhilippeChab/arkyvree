import type { CampaignDetail } from "@/client/src/lib/queries.ts";
import { useAuthStore } from "@/client/src/stores/authStore.ts";

/** What the session may do in a campaign; nothing until the campaign has loaded. */
export function useCampaignPermissions(campaign: Pick<CampaignDetail, "currentUserRole"> | undefined) {
  const isDM = campaign?.currentUserRole === "Game Master";
  // Demo users can run their own campaigns but can't pull other users in.
  const isDemo = useAuthStore((state) => !!state.user?.expiresAt);
  const canEdit = isDM;
  const canManageInvites = isDM && !isDemo;
  const canManagePlayers = isDM && !isDemo;

  return {
    isDM,
    canEdit,
    canManageInvites,
    canManagePlayers,
  };
}
