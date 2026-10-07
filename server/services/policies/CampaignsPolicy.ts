import type { Db } from "@/server/database/index.ts";
import { ForbiddenError, UnprocessableEntityError } from "@/server/errors/index.ts";
import { Players, Visibility } from "@/server/repositories/index.ts";
import type { Campaign, Player, Session } from "@/shared/relations.ts";

import BasePolicy from "./BasePolicy.ts";

/** What a campaign's checks read of it. */
type PolicyCampaign = Pick<Campaign, "id" | "deletedAt">;

export default class CampaignsPolicy extends BasePolicy<PolicyCampaign> {
  constructor(session: Pick<Session, "userId">, entity: PolicyCampaign, player: Player | null = null) {
    super(session, entity);
    this.player = player;
  }

  /**
   * The session's policy on `campaign`: its rights come from its player row, an archived one too (a campaign archived
   * before archiving left its players alone archived them with it). The PDF worker passes the export's user.
   */
  static async for(db: Db, session: Pick<Session, "userId">, campaign: PolicyCampaign) {
    const player = await Players.findOne(db, { userId: session.userId, campaignId: campaign.id }, Visibility.All);
    return new CampaignsPolicy(session, campaign, player ?? null);
  }

  private readonly player: Player | null;

  canDelete() {
    if (this.player?.role !== "Game Master") throw new ForbiddenError("Only the Game Master can manage this campaign");

    return true;
  }

  canHardDelete() {
    if (this.player?.role !== "Game Master")
      throw new ForbiddenError("Only the Game Master can permanently delete this campaign");

    if (!this.entity.deletedAt)
      throw new UnprocessableEntityError("Only archived campaigns can be permanently deleted");

    return true;
  }

  /** An archived campaign is read-only. */
  canModify() {
    if (this.entity.deletedAt) throw new ForbiddenError("Cannot modify an archived campaign");
    return true;
  }

  /** The session's player row in the campaign, an archived campaign's too, or a 403: what reading a campaign takes. */
  canRead() {
    if (!this.player) throw new ForbiddenError("You are not a member of this campaign");
    return this.player;
  }

  canUpdate() {
    if (!this.isGameMaster()) throw new ForbiddenError("Only the Game Master can edit this campaign");

    return true;
  }

  /** Whether the session is the campaign's Game Master, by an active player row. */
  isGameMaster() {
    return this.player?.role === "Game Master" && !this.player.deletedAt;
  }
}
