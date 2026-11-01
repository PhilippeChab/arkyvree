import type { Db } from "@/drizzle/database.ts";
import { ConflictError, ForbiddenError, NotFoundError, UnprocessableEntityError } from "@/server/errors/index.ts";
import { Players } from "@/server/repositories/index.ts";
import type { Campaign, Player, Session } from "@/shared/relations.ts";

import BasePolicy from "./BasePolicy.ts";
import type CharactersPolicy from "./CharactersPolicy.ts";

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

  /** Accepting an invite to a seat in the campaign: one that isn't archived. */
  canAcceptInvite() {
    if (this.entity.deletedAt) throw new ConflictError("Cannot accept an invite for an archived campaign");

    return true;
  }

  canDelete() {
    if (!this.isGameMaster()) throw new ForbiddenError("Only the Game Master can manage this campaign");

    return true;
  }

  /**
   * Exporting a character linked to the campaign as a PDF, from the campaign: its Game Master's, or whoever exports it
   * themselves (`character`, the session's policy on it: `canExport`, its editors').
   */
  canExportCharacter(character: CharactersPolicy) {
    return this.isGameMaster() || character.canExport();
  }

  canHardDelete() {
    if (!this.isGameMaster()) throw new ForbiddenError("Only the Game Master can permanently delete this campaign");

    if (!this.entity.deletedAt)
      throw new UnprocessableEntityError("Only archived campaigns can be permanently deleted");

    return true;
  }

  /**
   * Linking a character to the campaign, listing those the session could link, and setting the visibility of one it
   * linked (its link's, which its service matches to the seat): its seat (returned, `canRead`), in a campaign that isn't
   * archived (`canModify`).
   */
  canLinkCharacter() {
    const player = this.canRead();
    this.canModify();
    return player;
  }

  /** Adding, editing and removing the campaign's players: its Game Master's, in a campaign that isn't archived. */
  canManagePlayers() {
    this.canModify();
    return this.canUpdate();
  }

  /** An archived campaign is read-only. */
  canModify() {
    if (this.entity.deletedAt) throw new ForbiddenError("Cannot modify an archived campaign");
    return true;
  }

  /**
   * The session's player row in the campaign, an archived campaign's too (`isReadable`): what every request that names
   * the campaign by its id asks first. Anyone else gets the 404 an unknown campaign gets, so the campaign's existence
   * isn't revealed.
   */
  canRead() {
    if (!this.player) throw new NotFoundError("Campaign not found");
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

  /** Whether the session may read the campaign: it holds a live seat in it, Player or Game Master. */
  isReadable() {
    return this.player !== null;
  }
}
