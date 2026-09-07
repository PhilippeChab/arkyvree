import { invitesInCampaign, playersInCampaign } from "@/drizzle/schema.ts";
import { db, withTransaction } from "@/server/database/index.ts";
import { ConflictError, ForbiddenError, NotFoundError } from "@/server/errors/index.ts";
import { Visibility } from "@/server/repositories/BaseRepository.ts";
import { Activities, Campaigns, Invites, PlayerCharacters, Players } from "@/server/repositories/index.ts";
import BaseService from "@/server/services/BaseService.ts";
import { CampaignsPolicy } from "@/server/services/policies/index.ts";
import { createInviteInTransaction, sendInviteEmail, type InviteEmailData } from "./InvitesService.ts";
import type { Invite, Session } from "@/shared/relations.ts";
import { getTableName } from "drizzle-orm";

export const CampaignPlayersMethods = {
  async getCampaignPlayers(
    session: Session,
    campaignId: string,
    where: { search?: string; orderBy?: "createdAt" | "updatedAt"; orderDir?: "asc" | "desc" },
    pagination: { limit: number; page: number },
  ) {
    const campaign = await Campaigns.findOne(db, { id: campaignId }, Visibility.All);
    if (!campaign) {
      throw new NotFoundError("Campaign not found");
    }

    const player = await Players.findOne(
      db,
      { userId: session.userId, campaignId },
      Visibility.All,
    );
    if (!player) throw new ForbiddenError("You are not a member of this campaign");

    return await Players.findManyForCampaign(db, { campaignId, ...where }, pagination, Visibility.All);
  },

  async addCampaignPlayer(
    session: Session,
    campaignId: string,
    role: "Game Master" | "Player Character",
    email?: string,
  ) {
    let emailData: InviteEmailData | null = null;

    const { player, invite } = await withTransaction(async (tx) => {
      const campaign = await Campaigns.findOne(tx, { id: campaignId }, Visibility.All);
      if (!campaign) {
        throw new NotFoundError("Campaign not found");
      }
      if (campaign.deletedAt) {
        throw new ForbiddenError("Cannot modify an archived campaign");
      }

      await new CampaignsPolicy(session, campaign).canUpdate();

      const rows = await Players.create(tx, {
        campaignId,
        role,
      });
      const player = rows[0];

      await Activities.create(tx, {
        userId: session.userId,
        targetId: player.id,
        targetTable: getTableName(playersInCampaign),
        type: "addCampaignPlayer",
        data: { userId: player.userId, role: player.role },
      });

      let invite: Invite | null = null;
      if (email) {
        emailData = await createInviteInTransaction(tx, session, player, email);
        invite = emailData.invite as Invite;
      }

      return { player, invite };
    });

    if (emailData) {
      sendInviteEmail(emailData);
    }

    return { player, invite };
  },

  async updateCampaignPlayer(
    session: Session,
    campaignId: string,
    playerId: string,
    role: "Game Master" | "Player Character",
    email?: string,
  ) {
    let emailData: InviteEmailData | null = null;

    const { updatedPlayer, invite } = await withTransaction(async (tx) => {
      const campaign = await Campaigns.findOne(tx, { id: campaignId }, Visibility.All);
      if (!campaign) {
        throw new NotFoundError("Campaign not found");
      }
      if (campaign.deletedAt) {
        throw new ForbiddenError("Cannot modify an archived campaign");
      }

      await new CampaignsPolicy(session, campaign).canUpdate();

      const player = await Players.findOne(tx, { id: playerId, campaignId });
      if (!player) {
        throw new NotFoundError("Player not found in this campaign");
      }

      if (player.role === "Game Master" && role !== "Game Master") {
        const campaignPlayers = await Players.findMany(tx, { campaignId });
        const gmCount = campaignPlayers.filter((p) => p.role === "Game Master").length;
        if (gmCount <= 1) {
          throw new ConflictError("Cannot demote the last Game Master");
        }
      }

      // Update the player role
      const rows = await Players.update(tx, { role }, { id: playerId });
      const updatedPlayer = rows[0];

      const invites = await Invites.findMany(tx, { playerId });
      const existingInvite = invites[0];

      let invite: Invite | undefined = existingInvite;
      if (email) {
        if (player.userId) {
          throw new ConflictError("Player already has a user assigned");
        } else if (existingInvite?.status === "Pending") {
          throw new ConflictError("Player already has a pending invite");
        }

        emailData = await createInviteInTransaction(tx, session, updatedPlayer, email);
        invite = emailData.invite as Invite;
      }

      await Activities.create(tx, {
        userId: session.userId,
        targetId: updatedPlayer.id,
        targetTable: getTableName(playersInCampaign),
        type: "updateCampaignPlayer",
        data: { userId: updatedPlayer.userId, role: updatedPlayer.role },
      });

      return { updatedPlayer, invite };
    });

    if (emailData) {
      sendInviteEmail(emailData);
    }

    return { player: updatedPlayer, invite };
  },

  async removeCampaignPlayer(session: Session, campaignId: string, playerId: string) {
    return await withTransaction(async (tx) => {
      const campaign = await Campaigns.findOne(tx, { id: campaignId }, Visibility.All);
      if (!campaign) {
        throw new NotFoundError("Campaign not found");
      }
      if (campaign.deletedAt) {
        throw new ForbiddenError("Cannot modify an archived campaign");
      }

      const player = await Players.findOne(tx, { id: playerId });
      if (!player || player.campaignId !== campaignId) {
        throw new NotFoundError("Player not found in this campaign");
      }

      const isSelfRemoval = player.userId === session.userId;
      if (!isSelfRemoval) {
        await new CampaignsPolicy(session, campaign).canUpdate();
      }

      if (player.role === "Game Master") {
        const campaignPlayers = await Players.findMany(tx, { campaignId });
        const gmCount = campaignPlayers.filter((p) => p.role === "Game Master").length;
        if (gmCount <= 1) {
          throw new ConflictError("Cannot remove the last Game Master from a campaign");
        }
      }

      const removedPlayer = player;

      await Players.delete(tx, { id: playerId });
      const deletedInvites = await Invites.deleteByPlayerId(tx, { playerId });
      await PlayerCharacters.deleteByPlayerId(tx, { playerId });

      await Activities.deleteByTarget(tx, { targetId: removedPlayer.id, targetTable: getTableName(playersInCampaign) });
      if (deletedInvites.length > 0) {
        await Activities.deleteByTargets(tx, { targetIds: deletedInvites.map((i) => i.id), targetTable: getTableName(invitesInCampaign) });
      }

      await Activities.create(tx, {
        userId: session.userId,
        targetId: removedPlayer.id,
        targetTable: getTableName(playersInCampaign),
        type: "removeCampaignPlayer",
        data: { userId: removedPlayer.userId, role: removedPlayer.role },
      });

      return removedPlayer;
    });
  },
} as const;

class PlayersService extends BaseService<typeof CampaignPlayersMethods> {
  static initialize() {
    return new PlayersService(CampaignPlayersMethods);
  }
}

export default PlayersService;
