import type { CampaignDetail } from "@/client/src/pages/campaigns/campaignQueries.ts";

/** What the session may do in a campaign, as the server's policy answers it; nothing until the campaign has loaded. */
export function useCampaignPermissions(campaign: Pick<CampaignDetail, "permissions"> | undefined) {
  const permissions = campaign?.permissions;

  return {
    /** Archive it, while it's live. */
    canArchive: !!permissions?.canArchive,
    /** Edit its name and description, while it's live. */
    canEdit: !!permissions?.canEdit,
    /** Delete it for good, once it's archived. */
    canHardDelete: !!permissions?.canHardDelete,
    /** Link its own characters (each roster row's `canSetVisibility` answers its visibility select). */
    canLinkCharacters: !!permissions?.canLinkCharacters,
    /** Add, edit, move and delete its folders and documents, and choose whom each admits, while it's live. */
    canManageDocuments: !!permissions?.canManageDocuments,
    canManagePlayers: !!permissions?.canManagePlayers,
    /** Unarchive it, once it's archived. */
    canUnarchive: !!permissions?.canUnarchive,
  };
}
