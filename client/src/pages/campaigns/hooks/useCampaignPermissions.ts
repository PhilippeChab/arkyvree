import { useAuthStore } from "@/client/src/stores/authStore.ts";

export function useCampaignPermissions(campaign: { currentUserRole: string | null }) {
  const isDM = campaign.currentUserRole === "Game Master";
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
