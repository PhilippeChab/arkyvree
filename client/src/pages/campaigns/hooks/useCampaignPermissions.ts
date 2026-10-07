import { useIsDemo } from "@/client/src/hooks/index.ts";
import type { CampaignDetail } from "@/client/src/lib/queries.ts";

/** What the session may do in a campaign; nothing until the campaign has loaded. */
export function useCampaignPermissions(campaign: Pick<CampaignDetail, "currentUserRole"> | undefined) {
  const isDM = campaign?.currentUserRole === "Game Master";
  // Demo users can run their own campaigns but can't pull other users in.
  const isDemo = useIsDemo();
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
