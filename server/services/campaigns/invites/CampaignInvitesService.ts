import type { Db } from "@/drizzle/database.ts";
import { db, withTransaction } from "@/server/database/index.ts";
import { ConflictError, ForbiddenError, NotFoundError } from "@/server/errors/index.ts";
import { Campaigns, Invites, Players, Visibility } from "@/server/repositories/index.ts";
import { createActivityWithNotifications } from "@/server/services/activities/index.ts";
import { getPendingInvite, saveInviteAnswer } from "@/server/services/invites/index.ts";
import { CampaignsPolicy } from "@/server/services/policies/index.ts";
import { TARGET_TYPES } from "@/shared/activityTargets.ts";
import type { Invite, Session } from "@/shared/relations.ts";

class CampaignInvitesService {
  /** The invitee's answer, which the Game Masters are told of. */
  private async answerInvite(tx: Db, session: Session, invite: Invite, status: "Accepted" | "Rejected") {
    return await saveInviteAnswer(tx, session, Invites, invite.id, status, {
      targetType: TARGET_TYPES.invites,
      type: status === "Accepted" ? "acceptCampaignInvite" : "rejectCampaignInvite",
      data: { inviteId: invite.id },
    });
  }

  /** The campaign of an invite's player slot, archived or not. */
  private async getInviteCampaign(tx: Db, invite: Invite) {
    const player = await Players.findOne(tx, { id: invite.playerId });
    if (!player) throw new NotFoundError("Player not found");

    const campaign = await Campaigns.findOne(tx, { id: player.campaignId }, Visibility.All);
    if (!campaign) throw new NotFoundError("Campaign not found");

    return campaign;
  }

  /** Accepts the invite: its answer names the campaign joined, whose data its client refreshes. */
  async acceptInvite(session: Session, inviteId: string) {
    return await withTransaction(async (tx) => {
      const invite = await getPendingInvite(tx, session, Invites, inviteId, "Invite not found");
      const campaign = await this.getInviteCampaign(tx, invite);
      if (campaign.deletedAt) throw new ForbiddenError("Cannot accept an invite for an archived campaign");

      await Players.update(tx, { userId: session.userId }, { id: invite.playerId });
      return { ...(await this.answerInvite(tx, session, invite, "Accepted")), campaignId: campaign.id };
    });
  }

  // Single invite for the current user, any status. Used by the invite-accept
  // page so a stale link still resolves to "Already accepted" / "no longer
  // pending" copy instead of "Not found".
  async getInvite(session: Session, inviteId: string) {
    const invite = await Invites.findOneWithCampaign(db, {
      id: inviteId,
      userId: session.userId,
    });
    if (!invite) throw new NotFoundError("Invite not found");

    return invite;
  }

  async getInvites(
    session: Session,
    campaignId: string,
    where: { orderBy?: "createdAt" | "updatedAt"; orderDir?: "asc" | "desc"; search?: string },
    pagination: { limit: number; page: number },
  ) {
    const campaign = await Campaigns.findOne(db, { id: campaignId }, Visibility.All);
    if (!campaign) throw new NotFoundError("Campaign not found");

    (await CampaignsPolicy.for(db, session, campaign)).canRead();

    return await Invites.findPage(db, { campaignId, ...where }, pagination);
  }

  async rejectInvite(session: Session, inviteId: string) {
    return await withTransaction(async (tx) => {
      const invite = await getPendingInvite(tx, session, Invites, inviteId, "Invite not found");
      return await this.answerInvite(tx, session, invite, "Rejected");
    });
  }

  async revokeInvite(session: Session, inviteId: string) {
    return await withTransaction(async (tx) => {
      const invite = await Invites.findOne(tx, { id: inviteId });
      if (!invite) throw new NotFoundError("Invite not found");

      const campaign = await this.getInviteCampaign(tx, invite);

      (await CampaignsPolicy.for(tx, session, campaign)).canUpdate();

      if (invite.status !== "Pending") throw new ConflictError("Only pending invites can be revoked");

      const rows = await Invites.update(tx, { status: "Revoked" }, { id: inviteId });
      const updatedInvite = rows[0];

      await createActivityWithNotifications(tx, {
        userId: session.userId,
        targetId: updatedInvite.id,
        targetType: TARGET_TYPES.invites,
        type: "revokeCampaignInvite",
        data: { inviteId },
      });

      return updatedInvite;
    });
  }
}

export default new CampaignInvitesService();
