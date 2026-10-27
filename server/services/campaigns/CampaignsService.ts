import { db, withTransaction } from "@/server/database/index.ts";
import { InternalError, NotFoundError } from "@/server/errors/index.ts";
import {
  Activities,
  Campaigns,
  type Pagination,
  Players,
  Visibility,
  visibilityMap,
} from "@/server/repositories/index.ts";
import { CampaignsPolicy } from "@/server/services/policies/index.ts";
import { getReadableRuleset } from "@/server/services/rulesets/index.ts";
import { TARGET_TYPES } from "@/shared/activityTargets.ts";
import type { Session } from "@/shared/relations.ts";

class CampaignsService {
  async archiveCampaign(session: Session, id: string) {
    return await withTransaction(async (tx) => {
      const existingCampaign = await Campaigns.findOne(tx, { id });

      if (!existingCampaign) throw new NotFoundError("Campaign not found");

      (await CampaignsPolicy.for(tx, session, existingCampaign)).canDelete();

      // Archive flips deletedAt on the campaign row alone: its players, invites and player-character links stay live,
      // and unarchiving flips that row back (0096 restored the players a campaign archived before then had archived
      // with it). The campaign lists leave it out but under their Archived filter; its pages still read it, read-only.
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
    return await withTransaction(async (tx) => {
      const { policy } = await getReadableRuleset(tx, session, body.rulesetId);
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
    const rows = await Campaigns.findOneWithPlayerCount(db, { id });
    const campaign = rows[0];

    if (!campaign) throw new NotFoundError("Campaign not found");

    const player = (await CampaignsPolicy.for(db, session, campaign)).canRead();

    return { ...campaign, currentUserRole: player.role };
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
    return await withTransaction(async (tx) => {
      const existingCampaign = await Campaigns.findOne(tx, { id }, Visibility.ArchivedOnly);

      if (!existingCampaign) throw new NotFoundError("Campaign not found");

      (await CampaignsPolicy.for(tx, session, existingCampaign)).canHardDelete();

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
    return await withTransaction(async (tx) => {
      const existingCampaign = await Campaigns.findOne(tx, { id }, Visibility.ArchivedOnly);

      if (!existingCampaign) throw new NotFoundError("Campaign not found");

      (await CampaignsPolicy.for(tx, session, existingCampaign)).canDelete();

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
    return await withTransaction(async (tx) => {
      const existingCampaign = await Campaigns.findOne(tx, { id });

      if (!existingCampaign) throw new NotFoundError("Campaign not found");

      (await CampaignsPolicy.for(tx, session, existingCampaign)).canUpdate();

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
