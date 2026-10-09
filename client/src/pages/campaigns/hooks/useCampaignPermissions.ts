import type { CampaignDetail } from "@/client/src/lib/queries.ts";

/** What the session may do in a campaign; nothing until the campaign has loaded. */
export function useCampaignPermissions(campaign: Pick<CampaignDetail, "currentUserRole"> | undefined) {
  // Its Game Master runs it: its details, its players and its invites. A demo user, whom the server lets create no
  // campaign, is never one.
  const isDM = campaign?.currentUserRole === "Game Master";

  return {
    isDM,
    canEdit: isDM,
    canManagePlayers: isDM,
  };
}
