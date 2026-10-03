import { getTableName } from "drizzle-orm";

import { invitesInCampaign, playersInCampaign } from "@/drizzle/schema.ts";
import { type Db, db, withTransaction } from "@/server/database/index.ts";
import { emailService } from "@/server/emails/index.ts";
import { EmailTemplate } from "@/server/emails/templates.ts";
import { ConflictError, NotFoundError } from "@/server/errors/index.ts";
import { Visibility } from "@/server/repositories/BaseRepository.ts";
import { Activities, Campaigns, Invites, PlayerCharacters, Players, Users } from "@/server/repositories/index.ts";
import { createActivityWithNotifications } from "@/server/services/activities/index.ts";
import { CampaignsPolicy } from "@/server/services/policies/index.ts";
import type { CampaignRole } from "@/shared/enums.ts";
import type { Invite, Player, Session } from "@/shared/relations.ts";

type InviteEmailData = {
  invite: Invite;
  campaignName: string;
  inviteeName: string;
  inviterName: string;
  email: string;
};

class CampaignPlayersService {
  /** Core invite creation logic — must be called within a transaction. */
  private async createInviteInTransaction(tx: Db, session: Session, player: Player, email: string) {
    const campaign = await Campaigns.findOne(tx, { id: player.campaignId }, Visibility.All);
    if (!campaign) {
      throw new NotFoundError("Campaign not found");
    }
    const policy = new CampaignsPolicy(session, campaign);
    policy.canModify();
    await policy.canUpdate();

    // Look up user by email (may not exist)
    const user = await Users.findOne(tx, { emailAddress: email });

    // Check if there's already a pending invite for this player slot
    const existingInvite = await Invites.findOne(tx, { playerId: player.id, status: "Pending" });
    if (existingInvite) {
      throw new ConflictError("This player slot already has a pending invite");
    }

    if (user) {
      // Check if the user already has a player slot for this campaign
      const existingPlayer = await Players.findOne(tx, { userId: user.id, campaignId: player.campaignId });
      if (existingPlayer) {
        throw new ConflictError("User already has a player slot for this campaign");
      }

      // Check if the user already has a pending invite for this campaign
      const campaignPlayers = await Players.findMany(tx, {
        campaignId: player.campaignId,
      });
      const campaignPlayerIds = campaignPlayers.map((p) => p.id);
      const existingPendingInvite = await Invites.findOne(tx, {
        userId: user.id,
        playerIds: campaignPlayerIds,
        status: "Pending",
      });
      if (existingPendingInvite) {
        throw new ConflictError("User already has a pending invite for this campaign");
      }
    } else {
      // For email-only invites, check by email across the campaign
      const campaignPlayers = await Players.findMany(tx, {
        campaignId: player.campaignId,
      });
      const campaignPlayerIds = campaignPlayers.map((p) => p.id);
      const existingPendingInvite = await Invites.findOne(tx, {
        email,
        playerIds: campaignPlayerIds,
        status: "Pending",
      });
      if (existingPendingInvite) {
        throw new ConflictError("This email already has a pending invite for this campaign");
      }
    }

    const rows = await Invites.create(tx, {
      email,
      userId: user?.id,
      playerId: player.id,
    });
    const invite = rows[0];

    await createActivityWithNotifications(tx, {
      userId: session.userId,
      targetId: invite.id,
      targetTable: getTableName(invitesInCampaign),
      type: "createCampaignInvite",
      data: {
        email,
        invitedUserId: user?.id,
        playerId: player.id,
        campaignName: campaign.name,
        campaignId: campaign.id,
      },
    });

    const inviterUser = await Users.findOne(tx, { id: session.userId });

    return {
      invite,
      campaignName: campaign.name,
      inviteeName: user?.username || email.split("@")[0],
      inviterName: inviterUser?.username || inviterUser?.emailAddress.split("@")[0] || "Someone",
      email,
    };
  }

  /** Send the invite email (fire-and-forget, call after transaction commits). */
  private sendInviteEmail(data: InviteEmailData) {
    emailService.send({
      to: data.email,
      subject: `You've been invited to join ${data.campaignName}`,
      template: EmailTemplate.CampaignInvitation,
      props: {
        inviteeName: data.inviteeName,
        inviterName: data.inviterName,
        campaignName: data.campaignName,
        inviteId: data.invite.id,
      },
    });
  }

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

    await CampaignsPolicy.canRead(db, session, campaignId);

    return await Players.findManyForCampaign(db, { campaignId, ...where }, pagination, Visibility.All);
  }

  async addCampaignPlayer(session: Session, campaignId: string, role: CampaignRole, email?: string) {
    let emailData: InviteEmailData | null = null;

    const { player, invite } = await withTransaction(async (tx) => {
      const campaign = await Campaigns.findOne(tx, { id: campaignId }, Visibility.All);
      if (!campaign) {
        throw new NotFoundError("Campaign not found");
      }
      const policy = new CampaignsPolicy(session, campaign);
      policy.canModify();
      await policy.canUpdate();

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
        emailData = await this.createInviteInTransaction(tx, session, player, email);
        invite = emailData.invite;
      }

      return { player, invite };
    });

    if (emailData) {
      this.sendInviteEmail(emailData);
    }

    return { player, invite };
  }

  async updateCampaignPlayer(
    session: Session,
    campaignId: string,
    playerId: string,
    role: CampaignRole,
    email?: string,
  ) {
    let emailData: InviteEmailData | null = null;

    const { updatedPlayer, invite } = await withTransaction(async (tx) => {
      const campaign = await Campaigns.findOne(tx, { id: campaignId }, Visibility.All);
      if (!campaign) {
        throw new NotFoundError("Campaign not found");
      }
      const policy = new CampaignsPolicy(session, campaign);
      policy.canModify();
      await policy.canUpdate();

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

        emailData = await this.createInviteInTransaction(tx, session, updatedPlayer, email);
        invite = emailData.invite;
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
      this.sendInviteEmail(emailData);
    }

    return { player: updatedPlayer, invite };
  }

  async removeCampaignPlayer(session: Session, campaignId: string, playerId: string) {
    return await withTransaction(async (tx) => {
      const campaign = await Campaigns.findOne(tx, { id: campaignId }, Visibility.All);
      if (!campaign) {
        throw new NotFoundError("Campaign not found");
      }
      new CampaignsPolicy(session, campaign).canModify();

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
      await Invites.deleteByPlayerId(tx, { playerId });
      await PlayerCharacters.deleteByPlayerId(tx, { playerId });

      await Activities.create(tx, {
        userId: session.userId,
        targetId: removedPlayer.id,
        targetTable: getTableName(playersInCampaign),
        type: "removeCampaignPlayer",
        data: { userId: removedPlayer.userId, role: removedPlayer.role },
      });

      return removedPlayer;
    });
  }
}

export default new CampaignPlayersService();
