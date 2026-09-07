import { invitesInCampaign } from "@/drizzle/schema.ts";
import type { Db } from "@/server/database/index.ts";
import { db, withTransaction } from "@/server/database/index.ts";
import { ConflictError, ForbiddenError, NotFoundError } from "@/server/errors/index.ts";
import { Visibility } from "@/server/repositories/BaseRepository.ts";
import { Campaigns, Invites, Notifications, Players, Users } from "@/server/repositories/index.ts";
import { emailService } from "@/server/emails";
import { EmailTemplate } from "@/server/emails/templates.ts";
import { createActivityWithNotifications } from "@/server/services/activityNotifications.ts";
import BaseService from "@/server/services/BaseService.ts";
import { CampaignsPolicy } from "@/server/services/policies/index.ts";
import type { Player, Session } from "@/shared/relations.ts";
import { getTableName } from "drizzle-orm";

export type InviteEmailData = {
  invite: { id: string };
  campaignName: string;
  inviteeName: string;
  inviterName: string;
  email: string;
};

/** Core invite creation logic — must be called within a transaction. */
export async function createInviteInTransaction(
  tx: Db,
  session: Session,
  player: Player,
  email: string,
) {
  const campaign = await Campaigns.findOne(tx, { id: player.campaignId }, Visibility.All);
  if (!campaign) {
    throw new NotFoundError("Campaign not found");
  }
  if (campaign.deletedAt) {
    throw new ForbiddenError("Cannot modify an archived campaign");
  }

  await new CampaignsPolicy(session, campaign).canUpdate();

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
    data: { email, invitedUserId: user?.id, playerId: player.id, campaignName: campaign.name, campaignId: campaign.id },
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
export function sendInviteEmail(data: InviteEmailData) {
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

export const CampaignInvitesMethods = {
  async getUserInvites(userId: string) {
    return await Invites.findMany(db, { userId }, { limit: 10 }, { campaign: true });
  },

  // Single invite for the current user, any status. Used by the invite-accept
  // page so a stale link still resolves to "Already accepted" / "no longer
  // pending" copy instead of "Not found".
  async getCampaignInvite(session: Session, inviteId: string) {
    const invite = await Invites.findOneForUser(db, {
      id: inviteId,
      userId: session.userId,
    });
    if (!invite) {
      throw new NotFoundError("Invite not found");
    }
    return invite;
  },

  async getCampaignInvites(
    session: Session,
    campaignId: string,
    where: { search?: string; orderBy?: "createdAt" | "updatedAt"; orderDir?: "asc" | "desc" },
    pagination: { limit: number; page: number },
  ) {
    const campaign = await Campaigns.findOne(db, { id: campaignId }, Visibility.All);
    if (!campaign) {
      throw new NotFoundError("Campaign not found");
    }

    const player = await Players.findOne(db, { userId: session.userId, campaignId });
    if (!player) throw new ForbiddenError("You are not a member of this campaign");

    return await Invites.findManyForCampaign(db, { campaignId, ...where }, pagination);
  },

  async createCampaignInvite(
    session: Session,
    player: Player,
    email: string,
  ) {
    const emailData = await withTransaction(async (tx) => {
      return await createInviteInTransaction(tx, session, player, email);
    });

    sendInviteEmail(emailData);

    return emailData.invite;
  },

  async acceptCampaignInvite(session: Session, inviteId: string) {
    return await withTransaction(async (tx) => {
      const invite = await Invites.findOne(tx, { id: inviteId });
      if (!invite) {
        throw new NotFoundError("Invite not found");
      }

      if (invite.userId !== session.userId) {
        throw new NotFoundError("Invite not found");
      }

      if (invite.status !== "Pending") {
        throw new ConflictError("Invite is no longer pending");
      }

      const player = await Players.findOne(tx, { id: invite.playerId });
      if (!player) {
        throw new NotFoundError("Player not found");
      }

      const campaign = await Campaigns.findOne(tx, { id: player.campaignId }, Visibility.All);
      if (!campaign) {
        throw new NotFoundError("Campaign not found");
      }
      if (campaign.deletedAt) {
        throw new ForbiddenError("Cannot accept an invite for an archived campaign");
      }

      const rows = await Invites.update(tx, { status: "Accepted" }, { id: inviteId });
      const updatedInvite = rows[0];

      await Players.update(tx, { userId: session.userId }, { id: invite.playerId });

      await Notifications.markReadByTarget(tx, { recipientId: session.userId, targetId: inviteId });

      await createActivityWithNotifications(tx, {
        userId: session.userId,
        targetId: updatedInvite.id,
        targetTable: getTableName(invitesInCampaign),
        type: "acceptCampaignInvite",
        data: { inviteId },
      });

      return updatedInvite;
    });
  },

  async rejectCampaignInvite(session: Session, inviteId: string) {
    return await withTransaction(async (tx) => {
      const invite = await Invites.findOne(tx, { id: inviteId });
      if (!invite) {
        throw new NotFoundError("Invite not found");
      }

      if (invite.userId !== session.userId) {
        throw new NotFoundError("Invite not found");
      }

      if (invite.status !== "Pending") {
        throw new ConflictError("Invite is no longer pending");
      }

      const rows = await Invites.update(tx, { status: "Rejected" }, { id: inviteId });
      const updatedInvite = rows[0];

      await Notifications.markReadByTarget(tx, { recipientId: session.userId, targetId: inviteId });

      await createActivityWithNotifications(tx, {
        userId: session.userId,
        targetId: updatedInvite.id,
        targetTable: getTableName(invitesInCampaign),
        type: "rejectCampaignInvite",
        data: { inviteId },
      });

      return updatedInvite;
    });
  },

  async revokeCampaignInvite(session: Session, inviteId: string) {
    return await withTransaction(async (tx) => {
      const invite = await Invites.findOne(tx, { id: inviteId });
      if (!invite) {
        throw new NotFoundError("Invite not found");
      }

      const player = await Players.findOne(tx, { id: invite.playerId });
      if (!player) {
        throw new NotFoundError("Player not found");
      }

      const campaign = await Campaigns.findOne(tx, { id: player.campaignId }, Visibility.All);
      if (!campaign) {
        throw new NotFoundError("Campaign not found");
      }

      await new CampaignsPolicy(session, campaign).canUpdate();

      if (invite.status !== "Pending") {
        throw new ConflictError("Only pending invites can be revoked");
      }

      const rows = await Invites.update(tx, { status: "Revoked" }, { id: inviteId });
      const updatedInvite = rows[0];

      await createActivityWithNotifications(tx, {
        userId: session.userId,
        targetId: updatedInvite.id,
        targetTable: getTableName(invitesInCampaign),
        type: "revokeCampaignInvite",
        data: { inviteId },
      });

      return updatedInvite;
    });
  },
} as const;

class InvitesService extends BaseService<typeof CampaignInvitesMethods> {
  static initialize() {
    return new InvitesService(CampaignInvitesMethods);
  }
}

export default InvitesService;
