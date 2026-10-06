import { getTableName } from "drizzle-orm";

import { invitesInCampaign } from "@/drizzle/schema.ts";
import { type Db, db, withTransaction } from "@/server/database/index.ts";
import { ConflictError, ForbiddenError, NotFoundError } from "@/server/errors/index.ts";
import { Campaigns, Invites, Notifications, Players, Visibility } from "@/server/repositories/index.ts";
import { createActivityWithNotifications } from "@/server/services/activities/index.ts";
import { CampaignsPolicy } from "@/server/services/policies/index.ts";
import type { Invite, Session } from "@/shared/relations.ts";

class CampaignInvitesService {
  /** The campaign of an invite's player slot, archived or not. */
  private async getInviteCampaign(tx: Db, invite: Invite) {
    const player = await Players.findOne(tx, { id: invite.playerId });
    if (!player) {
      throw new NotFoundError("Player not found");
    }
    const campaign = await Campaigns.findOne(tx, { id: player.campaignId }, Visibility.All);
    if (!campaign) {
      throw new NotFoundError("Campaign not found");
    }
    return campaign;
  }

  /**
   * The pending invite addressed to the session's user. Anyone else's is a 404: it doesn't reveal the invite exists.
   */
  private async getPendingInviteFor(tx: Db, session: Session, inviteId: string) {
    const invite = await Invites.findOne(tx, { id: inviteId });
    if (!invite || invite.userId !== session.userId) {
      throw new NotFoundError("Invite not found");
    }
    if (invite.status !== "Pending") {
      throw new ConflictError("Invite is no longer pending");
    }
    return invite;
  }

  /**
   * The invitee's answer: the invite's status, its notification read,
   * and the activity the Game Masters are told of.
   */
  private async answerInvite(tx: Db, session: Session, invite: Invite, status: "Accepted" | "Rejected") {
    const [updatedInvite] = await Invites.update(tx, { status }, { id: invite.id });
    await Notifications.markRead(tx, { recipientId: session.userId, targetId: invite.id });
    await createActivityWithNotifications(tx, {
      userId: session.userId,
      targetId: updatedInvite.id,
      targetTable: getTableName(invitesInCampaign),
      type: status === "Accepted" ? "acceptCampaignInvite" : "rejectCampaignInvite",
      data: { inviteId: invite.id },
    });
    return updatedInvite;
  }

  // Single invite for the current user, any status. Used by the invite-accept
  // page so a stale link still resolves to "Already accepted" / "no longer
  // pending" copy instead of "Not found".
  async getInvite(session: Session, inviteId: string) {
    const invite = await Invites.findOneWithCampaign(db, {
      id: inviteId,
      userId: session.userId,
    });
    if (!invite) {
      throw new NotFoundError("Invite not found");
    }
    return invite;
  }

  async getInvites(
    session: Session,
    campaignId: string,
    where: { search?: string; orderBy?: "createdAt" | "updatedAt"; orderDir?: "asc" | "desc" },
    pagination: { limit: number; page: number },
  ) {
    const campaign = await Campaigns.findOne(db, { id: campaignId }, Visibility.All);
    if (!campaign) {
      throw new NotFoundError("Campaign not found");
    }

    (await CampaignsPolicy.for(db, session, campaign)).canRead();

    return await Invites.findPage(db, { campaignId, ...where }, pagination);
  }

  async getUserInvites(userId: string) {
    return await Invites.findMany(db, { userId }, { limit: 10 }, { campaign: true });
  }

  async acceptInvite(session: Session, inviteId: string) {
    return await withTransaction(async (tx) => {
      const invite = await this.getPendingInviteFor(tx, session, inviteId);
      const campaign = await this.getInviteCampaign(tx, invite);
      if (campaign.deletedAt) {
        throw new ForbiddenError("Cannot accept an invite for an archived campaign");
      }

      await Players.update(tx, { userId: session.userId }, { id: invite.playerId });
      return await this.answerInvite(tx, session, invite, "Accepted");
    });
  }

  async rejectInvite(session: Session, inviteId: string) {
    return await withTransaction(async (tx) => {
      const invite = await this.getPendingInviteFor(tx, session, inviteId);
      return await this.answerInvite(tx, session, invite, "Rejected");
    });
  }

  async revokeInvite(session: Session, inviteId: string) {
    return await withTransaction(async (tx) => {
      const invite = await Invites.findOne(tx, { id: inviteId });
      if (!invite) {
        throw new NotFoundError("Invite not found");
      }

      const campaign = await this.getInviteCampaign(tx, invite);

      (await CampaignsPolicy.for(tx, session, campaign)).canUpdate();

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
  }
}

export default new CampaignInvitesService();
