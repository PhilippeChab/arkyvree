import type { CampaignDetail } from "@/client/src/pages/campaigns/campaignQueries.ts";

/** What the session may do in a campaign, as the server's policy answers it; nothing until the campaign has loaded. */
export function useCampaignPermissions(campaign: Pick<CampaignDetail, "permissions"> | undefined) {
  const permissions = campaign?.permissions;

  return {
    canEdit: !!permissions?.canEdit,
    canLeave: !!permissions?.canLeave,
    /** Link its own characters, and set the visibility of those it linked. */
    canLinkCharacters: !!permissions?.canLinkCharacters,
    canManagePlayers: !!permissions?.canManagePlayers,
    canRevokeInvites: !!permissions?.canRevokeInvites,
  };
}
