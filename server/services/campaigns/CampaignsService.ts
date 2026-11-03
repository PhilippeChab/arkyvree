import { db } from "@/server/database/index.ts";
import { InternalError, NotFoundError } from "@/server/errors/index.ts";
import { Activities, Campaigns, type Pagination, Players, visibilityMap } from "@/server/repositories/index.ts";
import { type CampaignsPolicy, isAllowed } from "@/server/services/policies/index.ts";
import { withCampaignCreate, withCampaignWrite } from "@/server/services/writes/index.ts";
import { TARGET_TYPES } from "@/shared/activityTargets.ts";
import type { Player, Session } from "@/shared/relations.ts";

import { isLastGameMasterOf } from "./lastGameMaster.ts";
import { getReadableCampaign } from "./readableCampaign.ts";

class CampaignsService {
  /**
   * What the session may do in a campaign, as its policy decides it, the campaign's state with it: edit it and archive
   * it while it's live, unarchive it and delete it for good once it's archived, its Game Master's (`canEdit`,
   * `canArchive`, `canUnarchive`, `canHardDelete`), add, edit and remove its players (`canManagePlayers`), revoke a
   * pending invite, an archived campaign's too (`canRevokeInvites`), link the session's characters to it and set their
   * visibility (`canLinkCharacters`), and leave it (`canLeave`): its own seat's removal (`seat`), as its leave asks it,
   * never the last Game Master's (`isLastGameMaster`). The client offers what it answers.
   */
  private permissionsOf(policy: CampaignsPolicy, seat: Player, isLastGameMaster: boolean) {
    return {
      canArchive: isAllowed(() => policy.canArchive()),
      canEdit: isAllowed(() => policy.canEdit()),
      canHardDelete: isAllowed(() => policy.canHardDelete()),
      canLeave: isAllowed(() => policy.canRemovePlayer(seat, { isLastGameMaster })),
      canLinkCharacters: isAllowed(() => policy.canLinkCharacter()),
      canManagePlayers: isAllowed(() => policy.canManagePlayers()),
      canRevokeInvites: isAllowed(() => policy.canRevokeInvite()),
      canUnarchive: isAllowed(() => policy.canUnarchive()),
    };
  }

  async archiveCampaign(session: Session, id: string) {
    return await withCampaignWrite(session, id, async (tx, { policy }) => {
      // Archived or not: its policy refuses an archived one
      policy.canArchive();

      // Archive flips deletedAt on the campaign row alone: its players, invites and player-character links stay
      // live, and unarchiving flips that row back (0096 restored the players a campaign archived before then had
      // archived with it). The campaign lists leave it out but under their Archived filter; its pages still read it,
      // read-only.
      const rows = await Campaigns.archive(tx, { id });
      const archivedCampaign = rows[0];

      if (!archivedCampaign) throw new InternalError("Failed to archive campaign");

      await Activities.create(tx, {
        userId: session.userId,
        targetId: archivedCampaign.id,
        targetType: TARGET_TYPES.campaigns,
        type: "archiveCampaign",
      });

      return archivedCampaign;
    });
  }

  async createCampaign(
    session: Session,
    body: {
      description?: string;
      name: string;
      rulesetId: string;
    },
  ) {
    return await withCampaignCreate(session, body.rulesetId, async (tx, policy) => {
      policy.canCreateCampaign();

      const campaignRows = await Campaigns.create(tx, body);

      const campaign = campaignRows[0];
      if (!campaign) throw new InternalError("Failed to create campaign");

      const playerRows = await Players.create(tx, {
        userId: session.userId,
        campaignId: campaign.id,
        role: "Game Master",
      });

      const player = playerRows[0];
      if (!player) throw new InternalError("Failed to create player");

      await Activities.create(tx, {
        userId: session.userId,
        targetId: campaign.id,
        targetType: TARGET_TYPES.campaigns,
        type: "createCampaign",
      });

      return {
        campaign,
        player,
      };
    });
  }

  async getCampaign(session: Session, id: string) {
    const { member, policy } = await getReadableCampaign(db, session, id);

    const rows = await Campaigns.findOneWithPlayerCount(db, { id });
    const campaign = rows[0];

    if (!campaign) throw new NotFoundError("Campaign not found");

    const isLastGameMaster = await isLastGameMasterOf(db, member);
    return { ...campaign, permissions: this.permissionsOf(policy, member, isLastGameMaster) };
  }

  async getCampaigns(
    session: Session,
    where: {
      orderBy?: "name" | "createdAt" | "updatedAt";
      orderDir?: "asc" | "desc";
      search?: string;
      visibility?: keyof typeof visibilityMap;
    },
    pagination: Pagination,
  ) {
    const { visibility, ...filters } = where;
    return await Campaigns.findPage(
      db,
      { userId: session.userId, ...filters, ...(visibility && { visibility: visibilityMap[visibility] }) },
      pagination,
    );
  }

  async hardDeleteCampaign(session: Session, id: string) {
    // Archived or not: its policy refuses a live one
    return await withCampaignWrite(session, id, async (tx, { policy }) => {
      policy.canHardDelete();

      // Campaigns aren't an Attachable record type, so no polymorphic cleanup
      // is needed — every FK to campaigns.id cascades on delete.
      await Campaigns.delete(tx, { id });

      await Activities.create(tx, {
        userId: session.userId,
        targetId: id,
        targetType: TARGET_TYPES.campaigns,
        type: "hardDeleteCampaign",
      });

      return { id };
    });
  }

  async unarchiveCampaign(session: Session, id: string) {
    return await withCampaignWrite(session, id, async (tx, { policy }) => {
      // Archived or not: its policy refuses a live one
      policy.canUnarchive();

      const rows = await Campaigns.unarchive(tx, { id });
      const unarchivedCampaign = rows[0];

      if (!unarchivedCampaign) throw new InternalError("Failed to unarchive campaign");

      await Activities.create(tx, {
        userId: session.userId,
        targetId: unarchivedCampaign.id,
        targetType: TARGET_TYPES.campaigns,
        type: "unarchiveCampaign",
      });

      return unarchivedCampaign;
    });
  }

  async updateCampaign(
    session: Session,
    id: string,
    body: {
      description?: string;
      name?: string;
    },
  ) {
    return await withCampaignWrite(session, id, async (tx, { policy }) => {
      // Archived or not: its policy refuses an archived one
      policy.canEdit();

      const rows = await Campaigns.update(tx, body, { id });
      const updatedCampaign = rows[0];

      if (!updatedCampaign) throw new InternalError("Failed to update campaign");

      await Activities.create(tx, {
        userId: session.userId,
        targetId: updatedCampaign.id,
        targetType: TARGET_TYPES.campaigns,
        type: "updateCampaign",
      });

      return updatedCampaign;
    });
  }
}

export default new CampaignsService();
