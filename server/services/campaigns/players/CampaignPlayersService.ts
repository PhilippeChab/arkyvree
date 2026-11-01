import type { Db } from "@/drizzle/database.ts";
import { db, withTransaction } from "@/server/database/index.ts";
import { emailService, EmailTemplate } from "@/server/emails/index.ts";
import { ConflictError, NotFoundError } from "@/server/errors/index.ts";
import {
  Activities,
  Invites,
  type Pagination,
  PlayerCharacters,
  Players,
  Users,
  Visibility,
} from "@/server/repositories/index.ts";
import { createActivityWithNotifications } from "@/server/services/activities/index.ts";
import { redactPlayerAddresses } from "@/server/services/campaigns/campaignAddresses.ts";
import { getReadableCampaign } from "@/server/services/campaigns/readableCampaign.ts";
import { getInviteNames } from "@/server/services/invites/index.ts";
import { TARGET_TYPES } from "@/shared/activityTargets.ts";
import type { CampaignRole } from "@/shared/enums.ts";
import type { Campaign, Invite, Player, Session } from "@/shared/relations.ts";

interface InviteEmailData {
  campaignName: string;
  email: string;
  invite: Invite;
  inviteeName: string;
  inviterName: string;
}

class CampaignPlayersService {
  /**
   * Whether `player` is its campaign's last live Game Master (`masters`, the campaign's count of them), whom the server
   * neither removes nor demotes: an archived seat (its user's account deleted) never is.
   */
  private static isLastGameMaster(player: Pick<Player, "deletedAt" | "role">, masters: number) {
    return player.role === "Game Master" && !player.deletedAt && masters <= 1;
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

  /** Refuses (`message`) to remove or demote `player` when it's its campaign's last live Game Master. */
  private async assertNotLastGameMaster(tx: Db, player: Player, message: string) {
    if (player.role !== "Game Master") return;
    const masters = await Players.count(tx, { campaignId: player.campaignId, role: "Game Master" });
    if (CampaignPlayersService.isLastGameMaster(player, masters)) throw new ConflictError(message);
  }

  /**
   * Core invite creation logic — must be called within a transaction, by a caller that checked the session may manage
   * `campaign` (`getReadableCampaign`, `canManagePlayers`).
   */
  private async createInviteInTransaction(tx: Db, session: Session, campaign: Campaign, player: Player, email: string) {
    // Look up user by email (may not exist)
    const user = await Users.findOne(tx, { emailAddress: email });

    // Check if there's already a pending invite for this player slot
    const existingInvite = await Invites.findOne(tx, { playerId: player.id, status: "Pending" });
    if (existingInvite) throw new ConflictError("This player slot already has a pending invite");

    if (user) {
      // Check if the user already has a player slot for this campaign
      const existingPlayer = await Players.findOne(tx, { userId: user.id, campaignId: player.campaignId });
      if (existingPlayer) throw new ConflictError("User already has a player slot for this campaign");

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
      if (existingPendingInvite) throw new ConflictError("User already has a pending invite for this campaign");
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
      if (existingPendingInvite) throw new ConflictError("This email already has a pending invite for this campaign");
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
      targetType: TARGET_TYPES.invites,
      type: "createCampaignInvite",
      data: {
        email,
        invitedUserId: user?.id,
        playerId: player.id,
        campaignName: campaign.name,
        campaignId: campaign.id,
      },
    });

    const names = await getInviteNames(tx, session, user, email);

    return { invite, campaignName: campaign.name, ...names, email };
  }

  async addPlayer(session: Session, campaignId: string, role: CampaignRole, email?: string) {
    let emailData: InviteEmailData | null = null;

    const { player, invite } = await withTransaction(async (tx) => {
      const { campaign, policy } = await getReadableCampaign(tx, session, campaignId);
      policy.canManagePlayers();

      const rows = await Players.create(tx, {
        campaignId,
        role,
      });
      const player = rows[0];

      await Activities.create(tx, {
        userId: session.userId,
        targetId: player.id,
        targetType: TARGET_TYPES.players,
        type: "addCampaignPlayer",
        data: { userId: player.userId, role: player.role },
      });

      let invite: Invite | null = null;
      if (email) {
        emailData = await this.createInviteInTransaction(tx, session, campaign, player, email);
        invite = emailData.invite;
      }

      return { player, invite };
    });

    if (emailData) this.sendInviteEmail(emailData);

    return { player, invite };
  }

  async getPlayers(
    session: Session,
    campaignId: string,
    where: { orderBy?: "createdAt" | "updatedAt"; orderDir?: "asc" | "desc"; search?: string },
    pagination: Pagination,
  ) {
    const { policy } = await getReadableCampaign(db, session, campaignId);

    // An address is its Game Master's to read, and so to search
    const readsAddresses = policy.isGameMaster();
    const query = { campaignId, ...where, searchAddresses: readsAddresses };
    const page = await Players.findPage(db, query, pagination, Visibility.All);
    const masters = await Players.count(db, { campaignId, role: "Game Master" });
    const items = page.items.map((player) => ({
      ...player,
      isLastGameMaster: CampaignPlayersService.isLastGameMaster(player, masters),
    }));
    return {
      ...page,
      items: readsAddresses ? items : items.map((player) => redactPlayerAddresses(player, session.userId)),
    };
  }

  async removePlayer(session: Session, campaignId: string, playerId: string) {
    return await withTransaction(async (tx) => {
      const { policy } = await getReadableCampaign(tx, session, campaignId);
      policy.canModify();

      const player = await Players.findOne(tx, { id: playerId });
      if (!player || player.campaignId !== campaignId) throw new NotFoundError("Player not found in this campaign");

      // A player leaves on their own; another's removal is the Game Master's
      if (player.userId !== session.userId) policy.canManagePlayers();

      await this.assertNotLastGameMaster(tx, player, "Cannot remove the last Game Master from a campaign");

      const removedPlayer = player;

      await Players.delete(tx, { id: playerId });
      await Invites.delete(tx, { playerId });
      await PlayerCharacters.delete(tx, { playerId });

      await Activities.create(tx, {
        userId: session.userId,
        targetId: removedPlayer.id,
        targetType: TARGET_TYPES.players,
        type: "removeCampaignPlayer",
        data: { userId: removedPlayer.userId, role: removedPlayer.role },
      });

      return removedPlayer;
    });
  }

  async updatePlayer(session: Session, campaignId: string, playerId: string, role: CampaignRole, email?: string) {
    let emailData: InviteEmailData | null = null;

    const { updatedPlayer, invite } = await withTransaction(async (tx) => {
      const { campaign, policy } = await getReadableCampaign(tx, session, campaignId);
      policy.canManagePlayers();

      const player = await Players.findOne(tx, { id: playerId, campaignId });
      if (!player) throw new NotFoundError("Player not found in this campaign");

      if (role !== "Game Master") await this.assertNotLastGameMaster(tx, player, "Cannot demote the last Game Master");

      const rows = await Players.update(tx, { role }, { id: playerId });
      const updatedPlayer = rows[0];

      const invites = await Invites.findMany(tx, { playerId });
      const existingInvite = invites[0];

      let invite: Invite | undefined = existingInvite;
      if (email) {
        if (player.userId) throw new ConflictError("Player already has a user assigned");
        else if (existingInvite?.status === "Pending") throw new ConflictError("Player already has a pending invite");

        emailData = await this.createInviteInTransaction(tx, session, campaign, updatedPlayer, email);
        invite = emailData.invite;
      }

      await Activities.create(tx, {
        userId: session.userId,
        targetId: updatedPlayer.id,
        targetType: TARGET_TYPES.players,
        type: "updateCampaignPlayer",
        data: { userId: updatedPlayer.userId, role: updatedPlayer.role },
      });

      return { updatedPlayer, invite };
    });

    if (emailData) this.sendInviteEmail(emailData);

    return { player: updatedPlayer, invite };
  }
}

export default new CampaignPlayersService();
