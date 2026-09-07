import { db } from "@/server/database/index.ts";
import { ForbiddenError, UnprocessableEntityError } from "@/server/errors/index.ts";
import { Players } from "@/server/repositories/index.ts";
import { Visibility } from "@/server/repositories/BaseRepository.ts";
import { type Campaign } from "@/shared/relations.ts";
import BasePolicy from "./BasePolicy.ts";

export default class CampaignsPolicy extends BasePolicy<Campaign> {
  canCreate() {
    return true;
  }

  canRead() {
    return true;
  }

  async canUpdate() {
    const player = await Players.findOne(db, {
      userId: this.session.userId,
      campaignId: this.entity.id,
    });

    if (!player || player.role !== "Game Master") {
      throw new ForbiddenError("Only the Game Master can edit this campaign");
    }

    return true;
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
}
