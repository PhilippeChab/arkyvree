import { getTableName } from "drizzle-orm";

import { campaignsInCampaign } from "@/drizzle/schema.ts";
import { db, withTransaction } from "@/server/database/index.ts";
import { InternalError, NotFoundError } from "@/server/errors/index.ts";
import { Activities, Campaigns, Players, Rulesets, Visibility, visibilityMap } from "@/server/repositories/index.ts";
import { CampaignsPolicy, RulesetsPolicy } from "@/server/services/policies/index.ts";
import type { Session } from "@/shared/relations.ts";

class CampaignsService {
  async getCampaign(session: Session, id: string) {
    const rows = await Campaigns.findOneWithPlayerCount(db, { id });
    const campaign = rows[0];

    if (!campaign) {
      throw new NotFoundError("Campaign not found");
    }

    const player = await CampaignsPolicy.canRead(db, session, id);

    return { ...campaign, currentUserRole: player.role };
  }

  async getCampaigns(
    session: Session,
    where: {
      visibility?: keyof typeof visibilityMap;
      search?: string;
      orderBy?: "name" | "createdAt" | "updatedAt";
      orderDir?: "asc" | "desc";
    },
    pagination: { limit: number; page: number },
  ) {
    const { visibility, ...filters } = where;
    return await Campaigns.findPage(
      db,
      { userId: session.userId, ...filters, ...(visibility && { visibility: visibilityMap[visibility] }) },
      pagination,
    );
  }

  async createCampaign(
    session: Session,
    body: {
      name: string;
      description?: string;
      rulesetId: string;
    },
  ) {
    return await withTransaction(async (tx) => {
      const ruleset = await Rulesets.findOne(tx, { id: body.rulesetId });
      if (!ruleset) throw new NotFoundError("Ruleset not found");
      await (await RulesetsPolicy.for(tx, session, ruleset)).canCreateCampaign(tx);

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
  }

  async updateCampaign(
    session: Session,
    id: string,
    body: {
      name?: string;
      description?: string;
    },
  ) {
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
  }

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
  }

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
  }

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
  }
}

export default new CampaignsService();
