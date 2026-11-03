import type { Db } from "@/drizzle/database.ts";
import { db } from "@/server/database/index.ts";
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
import { redactArchivedPlayer, redactPlayerAddresses } from "@/server/services/campaigns/campaignAddresses.ts";
import { countGameMasters, isLastGameMaster, isLastGameMasterOf } from "@/server/services/campaigns/lastGameMaster.ts";
import { getReadableCampaign } from "@/server/services/campaigns/readableCampaign.ts";
import { getInviteNames } from "@/server/services/invites/index.ts";
import { type CampaignsPolicy, isAllowed } from "@/server/services/policies/index.ts";
import { withCampaignWrite } from "@/server/services/writes/index.ts";
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

  /**
   * Core invite creation logic — must be called within a transaction: the seat (`player`) takes one, as its policy
   * decides (`canInviteToSeat`: a live seat, no user of its own, no pending invite), then the invitee is no player of the
   * campaign's yet, nor invited to it.
   */
  private async createInviteInTransaction(
    tx: Db,
    session: Session,
    campaign: Campaign,
    policy: CampaignsPolicy,
    player: Player,
    email: string,
  ) {
    const pending = await Invites.findOne(tx, { playerId: player.id, status: "Pending" });
    policy.canInviteToSeat(player, { pendingInvite: !!pending });

    // Look up user by email (may not exist)
    const user = await Users.findOne(tx, { emailAddress: email });

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

    const { player, invite } = await withCampaignWrite(
      session,
      campaignId,
      async (tx, { campaign, policy }) => {
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
          emailData = await this.createInviteInTransaction(tx, session, campaign, policy, player, email);
          invite = emailData.invite;
        }

        return { player, invite };
      },
      { account: email ? { email } : undefined },
    );

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

    const query = { campaignId, ...where, searchAddresses: policy.isAddressReader() };
    const page = await Players.findPage(db, query, pagination, Visibility.All);
    const masters = await countGameMasters(db, campaignId);
    // Each with what the session may do to it, as the policy decides: change it, invite someone to it, remove it (its
    // own: leave it), and revoke its pending invite
    const items = page.items.map((player) => {
      const lastGameMaster = isLastGameMaster(player, masters);
      const invite = player.invitesInCampaigns[0];
      return {
        ...player,
        canEdit: isAllowed(() => policy.canUpdatePlayer(player, { isLastGameMaster: lastGameMaster })),
        canInvite: isAllowed(() => policy.canInviteToSeat(player, { pendingInvite: !!invite })),
        canRemove: isAllowed(() => policy.canRemovePlayer(player, { isLastGameMaster: lastGameMaster })),
        canRevokeInvite: !!invite && isAllowed(() => policy.canRevokeInvite(invite)),
        isLastGameMaster: lastGameMaster,
      };
    });
    return {
      ...page,
      items: items.map((player) => {
        if (player.deletedAt) return redactArchivedPlayer(player);
        return policy.isSlotAddressReader(player.usersInAccount?.id) ? player : redactPlayerAddresses(player);
      }),
    };
  }

  async removePlayer(session: Session, campaignId: string, playerId: string) {
    return await withCampaignWrite(session, campaignId, async (tx, { policy }) => {
      const player = await Players.findOne(tx, { id: playerId });
      if (!player || player.campaignId !== campaignId) throw new NotFoundError("Player not found in this campaign");

      // A player leaves on their own; another's removal is the Game Master's; never the last Game Master's
      policy.canRemovePlayer(player, { isLastGameMaster: await isLastGameMasterOf(tx, player) });

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

    const { updatedPlayer, invite } = await withCampaignWrite(
      session,
      campaignId,
      async (tx, { campaign, policy }) => {
        const player = await Players.findOne(tx, { id: playerId, campaignId });
        if (!player) throw new NotFoundError("Player not found in this campaign");

        policy.canUpdatePlayer(player, { isLastGameMaster: await isLastGameMasterOf(tx, player), role });

        const rows = await Players.update(tx, { role }, { id: playerId });
        const updatedPlayer = rows[0];

        const invites = await Invites.findMany(tx, { playerId });
        const existingInvite = invites[0];

        let invite: Invite | undefined = existingInvite;
        if (email) {
          emailData = await this.createInviteInTransaction(tx, session, campaign, policy, updatedPlayer, email);
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
      },
      { account: email ? { email } : undefined },
    );

    if (emailData) this.sendInviteEmail(emailData);

    return { player: updatedPlayer, invite };
  }
}

export default new CampaignPlayersService();
