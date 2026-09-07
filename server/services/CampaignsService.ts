import { campaignsInCampaign } from "@/drizzle/schema.ts";
import { db, withTransaction } from "@/server/database/index.ts";
import { ForbiddenError, InternalError, NotFoundError } from "@/server/errors/index.ts";
import { Visibility } from "@/server/repositories/BaseRepository.ts";
import { Activities, Campaigns, Players } from "@/server/repositories/index.ts";
import BaseService from "@/server/services/BaseService.ts";
import { CampaignsPolicy } from "@/server/services/policies/index.ts";
import type { Session } from "@/shared/relations.ts";
import { getTableName } from "drizzle-orm";

export const CampaignsMethods = {
  async getMyCampaigns(
    session: Session,
    where: {
      visibility?: Visibility;
      search?: string;
      orderBy?: "name" | "createdAt" | "updatedAt";
      orderDir?: "asc" | "desc";
    },
    pagination: { limit: number; page: number },
  ) {
    return await Campaigns.findMany(db, { userId: session.userId, ...where }, pagination);
  },

  async getCampaignById(session: Session, id: string) {
    const rows = await Campaigns.findOneWithPlayerCount(db, { id });
    const campaign = rows[0];

    if (!campaign) {
      throw new NotFoundError("Campaign not found");
    }

    // Archived campaigns also archive their player rows, so default
    // UnarchivedOnly would miss the membership. Use Visibility.All.
    const player = await Players.findOne(
      db,
      { userId: session.userId, campaignId: id },
      Visibility.All,
    );
    if (!player) throw new ForbiddenError("You are not a member of this campaign");

    return { ...campaign, currentUserRole: player.role };
  },

  async createCampaign(session: Session, body: {
    name: string;
    description?: string;
    rulesetId: string;
  }) {
    return await withTransaction(async (tx) => {
      const campaignRows = await Campaigns.create(tx, body);

      const campaign = campaignRows[0];
      if (!campaign) {
        throw new InternalError("Failed to create campaign");
      }

      const playerRows = await Players.create(tx, {
        userId: session.userId,
        campaignId: campaign.id,
        role: "Game Master",
      });

      const player = playerRows[0];
      if (!player) {
        throw new InternalError("Failed to create player");
      }

      await Activities.create(tx, {
        userId: session.userId,
        targetId: campaign.id,
        targetTable: getTableName(campaignsInCampaign),
        type: "createCampaign",
      });

      return {
        campaign,
        player,
      };
    });
  },

  async updateCampaign(session: Session, id: string, body: {
    name?: string;
    description?: string;
  }) {
    return await withTransaction(async (tx) => {
      const existingCampaign = await Campaigns.findOne(tx, { id });

      if (!existingCampaign) {
        throw new NotFoundError("Campaign not found");
      }

      await new CampaignsPolicy(session, existingCampaign).canUpdate();

      const rows = await Campaigns.update(tx, body, { id });
      const updatedCampaign = rows[0];

      if (!updatedCampaign) {
        throw new InternalError("Failed to update campaign");
      }

      await Activities.create(tx, {
        userId: session.userId,
        targetId: updatedCampaign.id,
        targetTable: getTableName(campaignsInCampaign),
        type: "updateCampaign",
      });

      return updatedCampaign;
    });
  },

  async archiveCampaign(session: Session, id: string) {
    return await withTransaction(async (tx) => {
      const existingCampaign = await Campaigns.findOne(tx, { id });

      if (!existingCampaign) {
        throw new NotFoundError("Campaign not found");
      }

      await new CampaignsPolicy(session, existingCampaign).canDelete();

      // Archive flips deletedAt on the campaign row only — players, invites,
      // and player-character links stay live. Campaigns.findMany filters
      // archived campaigns out of list views for everyone, so those rows
      // are only reachable by direct navigation (bookmarks), which already
      // loads via Visibility.All. Unarchive below still un-cascades for
      // legacy campaigns whose players were cascade-archived pre-change.
      const rows = await Campaigns.archive(tx, { id });
      const archivedCampaign = rows[0];

      if (!archivedCampaign) {
        throw new InternalError("Failed to archive campaign");
      }

      await Activities.create(tx, {
        userId: session.userId,
        targetId: archivedCampaign.id,
        targetTable: getTableName(campaignsInCampaign),
        type: "archiveCampaign",
      });

      return archivedCampaign;
    });
  },
  async hardDeleteCampaign(session: Session, id: string) {
    return await withTransaction(async (tx) => {
      const existingCampaign = await Campaigns.findOne(tx, { id }, Visibility.ArchivedOnly);

      if (!existingCampaign) {
        throw new NotFoundError("Campaign not found");
      }

      await new CampaignsPolicy(session, existingCampaign).canHardDelete();

      // Campaigns aren't an Attachable record type, so no polymorphic cleanup
      // is needed — every FK to campaigns.id cascades on delete.
      await Campaigns.delete(tx, { id });

      await Activities.create(tx, {
        userId: session.userId,
        targetId: id,
        targetTable: getTableName(campaignsInCampaign),
        type: "hardDeleteCampaign",
      });

      return { id };
    });
  },

  async unarchiveCampaign(session: Session, id: string) {
    return await withTransaction(async (tx) => {
      const existingCampaign = await Campaigns.findOne(tx, { id }, Visibility.ArchivedOnly);

      if (!existingCampaign) {
        throw new NotFoundError("Campaign not found");
      }

      await new CampaignsPolicy(session, existingCampaign).canDelete();

      const rows = await Campaigns.unarchive(tx, { id });
      const unarchivedCampaign = rows[0];

      if (!unarchivedCampaign) {
        throw new InternalError("Failed to unarchive campaign");
      }

      await Activities.create(tx, {
        userId: session.userId,
        targetId: unarchivedCampaign.id,
        targetTable: getTableName(campaignsInCampaign),
        type: "unarchiveCampaign",
      });

      return unarchivedCampaign;
    });
  },

} as const;

class CampaignsService extends BaseService<typeof CampaignsMethods> {
  static initialize() {
    return new CampaignsService(CampaignsMethods);
  }
}

export default CampaignsService;
