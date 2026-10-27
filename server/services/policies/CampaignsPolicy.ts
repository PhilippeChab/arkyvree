import type { Db } from "@/drizzle/database.ts";
import { ForbiddenError, NotFoundError, UnprocessableEntityError } from "@/server/errors/index.ts";
import { Players } from "@/server/repositories/index.ts";
import type { Campaign, Player, Session } from "@/shared/relations.ts";

import BasePolicy from "./BasePolicy.ts";

/** What a character's check reads of its link to the campaign: the player who linked it, and how they linked it. */
interface CharacterLink {
  playerId: string;
  visibility: string;
}

/** What a campaign's checks read of it. */
type PolicyCampaign = Pick<Campaign, "id" | "deletedAt">;

export default class CampaignsPolicy extends BasePolicy<PolicyCampaign> {
  constructor(session: Pick<Session, "userId">, entity: PolicyCampaign, player: Player | null = null) {
    super(session, entity);
    this.player = player;
  }

  /**
   * The session's policy on `campaign`: its rights come from its live player row, an archived campaign's too (archiving
   * a campaign leaves its seats alone; a seat is archived only with its user's account). The PDF worker passes the
   * export's user.
   */
  static async for(db: Db, session: Pick<Session, "userId">, campaign: PolicyCampaign) {
    const player = await Players.findOne(db, { userId: session.userId, campaignId: campaign.id });
    return new CampaignsPolicy(session, campaign, player ?? null);
  }

  private readonly player: Player | null;

  canDelete() {
    if (!this.isGameMaster()) throw new ForbiddenError("Only the Game Master can manage this campaign");

    return true;
  }

  canHardDelete() {
    if (!this.isGameMaster()) throw new ForbiddenError("Only the Game Master can permanently delete this campaign");

    if (!this.entity.deletedAt)
      throw new UnprocessableEntityError("Only archived campaigns can be permanently deleted");

    return true;
  }

  /**
   * Listing the characters the session could link to the campaign: what linking one takes, its seat in a campaign that
   * isn't archived (`canModify`). Whoever may not read the campaign gets the 404 an unknown campaign gets, so neither its
   * existence nor its ruleset shows.
   */
  canListLinkableCharacters() {
    if (!this.player) throw new NotFoundError("Campaign not found");
    this.canModify();
    return this.player;
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

  /**
   * Whether the session sees the campaign's character `link`: a member does, but a Private one is its player's and the
   * Game Master's alone, refused to the others as not linked (a 404), as an unknown character is.
   */
  canSeeCharacter(link: CharacterLink) {
    const player = this.canRead();
    if (link.visibility === "Private" && link.playerId !== player.id && !this.isGameMaster())
      throw new NotFoundError("Character not found in this campaign");

    return true;
  }

  canUpdate() {
    if (!this.isGameMaster()) throw new ForbiddenError("Only the Game Master can edit this campaign");

    return true;
  }

  /** Whether the session's player row is the campaign's Game Master's. */
  isGameMaster() {
    return this.player?.role === "Game Master";
  }
}
