import { getTableName } from "drizzle-orm";

import { invitesInCampaign } from "@/drizzle/schema.ts";
import { db, withTransaction } from "@/server/database/index.ts";
import { ConflictError, ForbiddenError, NotFoundError } from "@/server/errors/index.ts";
import { Visibility } from "@/server/repositories/BaseRepository.ts";
import { Campaigns, Invites, Notifications, Players } from "@/server/repositories/index.ts";
import { createActivityWithNotifications } from "@/server/services/activityNotifications.ts";
import BaseService from "@/server/services/BaseService.ts";
import { CampaignsPolicy } from "@/server/services/policies/index.ts";
import type { Session } from "@/shared/relations.ts";

const CampaignInvitesMethods = {
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
