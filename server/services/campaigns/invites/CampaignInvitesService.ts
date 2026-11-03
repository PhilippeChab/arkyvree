import type { Db } from "@/drizzle/database.ts";
import { db } from "@/server/database/index.ts";
import { NotFoundError } from "@/server/errors/index.ts";
import { Campaigns, Invites, type Pagination, Players, Visibility } from "@/server/repositories/index.ts";
import { createActivityWithNotifications } from "@/server/services/activities/index.ts";
import { redactInviteAddresses } from "@/server/services/campaigns/campaignAddresses.ts";
import { findReadableCampaign, getReadableCampaign } from "@/server/services/campaigns/readableCampaign.ts";
import {
  describeInviteAnswers,
  getOwnInvite,
  readCampaignInvitePolicies,
  saveInviteAnswer,
} from "@/server/services/invites/index.ts";
import { CampaignsPolicy } from "@/server/services/policies/index.ts";
import { withInviteCampaign } from "@/server/services/writes/index.ts";
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

  /**
   * The campaign of an invite's player slot, either archived or not: an answered invite outlives a seat archived since
   * (a later player's account deleted), so its policy still answers it as no longer pending.
   */
  private async getInviteCampaign(tx: Db, invite: Invite) {
    const player = await Players.findOne(tx, { id: invite.playerId }, Visibility.All);
    if (!player) throw new NotFoundError("Player not found");

    const campaign = await Campaigns.findOne(tx, { id: player.campaignId }, Visibility.All);
    if (!campaign) throw new NotFoundError("Campaign not found");

    return campaign;
  }

  /** Accepts the invite: its answer names the campaign joined, whose data its client refreshes. */
  async acceptInvite(session: Session, inviteId: string) {
    return await withInviteCampaign(inviteId, async (tx) => {
      const invite = await getOwnInvite(tx, session, Invites, inviteId, "Invite not found");
      const campaign = await this.getInviteCampaign(tx, invite);
      (await CampaignsPolicy.for(tx, session, campaign)).canAcceptInvite(invite);

      await Players.update(tx, { userId: session.userId }, { id: invite.playerId });
      return { ...(await this.answerInvite(tx, session, invite, "Accepted")), campaignId: campaign.id };
    });
  }

  /**
   * The session's invite, whatever its status, so a stale link still says what became of it, as the campaign's policy
   * answers it: whether it may be accepted (`canAccept`) and why not (`acceptRefusal`, in the refusal's words), whether
   * it may still be answered (`canReject`), and whether the session holds a seat there (`isSeated`), whose page offers
   * the campaign beside its Reject.
   */
  async getInvite(session: Session, inviteId: string) {
    const invite = await Invites.findOneWithCampaign(db, {
      id: inviteId,
      userId: session.userId,
    });
    if (!invite) throw new NotFoundError("Invite not found");

    const policy = (await readCampaignInvitePolicies(db, session, [invite])).get(invite.id);
    return {
      ...invite,
      ...describeInviteAnswers(policy, invite),
      isSeated: !!policy?.isReadable(),
    };
  }

  async getInvites(
    session: Session,
    campaignId: string,
    where: { orderBy?: "createdAt" | "updatedAt"; orderDir?: "asc" | "desc"; search?: string },
    pagination: Pagination,
  ) {
    const { policy } = await getReadableCampaign(db, session, campaignId);

    const readsAddresses = policy.isAddressReader();
    const page = await Invites.findPage(db, { campaignId, ...where, searchAddresses: readsAddresses }, pagination);
    return readsAddresses ? page : { ...page, items: page.items.map(redactInviteAddresses) };
  }

  async rejectInvite(session: Session, inviteId: string) {
    return await withInviteCampaign(inviteId, async (tx) => {
      const invite = await getOwnInvite(tx, session, Invites, inviteId, "Invite not found");
      const campaign = await this.getInviteCampaign(tx, invite);
      (await CampaignsPolicy.for(tx, session, campaign)).canAnswerInvite(invite);

      return await this.answerInvite(tx, session, invite, "Rejected");
    });
  }

  async revokeInvite(session: Session, inviteId: string) {
    return await withInviteCampaign(inviteId, async (tx) => {
      // Whoever may not read its campaign gets the answer an unknown invite gets, before any other check: its slot is
      // read archived or not (a slot is archived with its user's account, its rejected invite left behind)
      const invite = await Invites.findOne(tx, { id: inviteId });
      const player = invite && (await Players.findOne(tx, { id: invite.playerId }, Visibility.All));
      const readable = player && (await findReadableCampaign(tx, session, player.campaignId));
      if (!invite || !readable) throw new NotFoundError("Invite not found");
      readable.policy.canRevokeInvite(invite);

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
