import { type Db, db } from "@/server/database/index.ts";
import { ForbiddenError, UnprocessableEntityError } from "@/server/errors/index.ts";
import { Visibility } from "@/server/repositories/BaseRepository.ts";
import { Players } from "@/server/repositories/index.ts";
import type { Campaign, Player, Session } from "@/shared/relations.ts";

import BasePolicy from "./BasePolicy.ts";

export default class CampaignsPolicy extends BasePolicy<Campaign> {
  /** For callers without a session, like the PDF worker re-checking export access. */
  static async isGameMaster(userId: string, campaignId: string): Promise<boolean> {
    const player = await Players.findOne(db, { userId, campaignId });
    return player?.role === "Game Master";
  }

  /** The session's player row in the campaign, an archived campaign's too, or a 403: what reading a campaign takes. */
  static async canRead(db: Db, session: Session, campaignId: string): Promise<Player> {
    const player = await Players.findOne(db, { userId: session.userId, campaignId }, Visibility.All);
    if (!player) throw new ForbiddenError("You are not a member of this campaign");
    return player;
  }

  async canDelete() {
    // Archived campaigns also archive their player rows — include them.
    const player = await Players.findOne(
      db,
      { userId: this.session.userId, campaignId: this.entity.id },
      Visibility.All,
    );

    if (!player || player.role !== "Game Master") {
      throw new ForbiddenError("Only the Game Master can manage this campaign");
    }

    return true;
  }

  async canHardDelete() {
    const player = await Players.findOne(
      db,
      { userId: this.session.userId, campaignId: this.entity.id },
      Visibility.All,
    );
    if (!player || player.role !== "Game Master") {
      throw new ForbiddenError("Only the Game Master can permanently delete this campaign");
    }
    if (!this.entity.deletedAt) {
      throw new UnprocessableEntityError("Only archived campaigns can be permanently deleted");
    }
    return true;
  }

  /** An archived campaign is read-only. */
  canModify() {
    if (this.entity.deletedAt) throw new ForbiddenError("Cannot modify an archived campaign");
    return true;
  }

  async canUpdate() {
    if (!(await CampaignsPolicy.isGameMaster(this.session.userId, this.entity.id))) {
      throw new ForbiddenError("Only the Game Master can edit this campaign");
    }

    return true;
  }
}
