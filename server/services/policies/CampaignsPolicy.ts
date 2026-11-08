import type { Db } from "@/drizzle/database.ts";
import { ConflictError, ForbiddenError, NotFoundError } from "@/server/errors/index.ts";
import { Players } from "@/server/repositories/index.ts";
import { type DocumentAudience, isInDocumentAudience } from "@/shared/campaignDocuments.ts";
import type { CharacterVisibility } from "@/shared/campaigns.ts";
import type { CampaignRole } from "@/shared/enums.ts";
import type { Campaign, Player, Session } from "@/shared/relations.ts";

import BasePolicy from "./BasePolicy.ts";
import type CharactersPolicy from "./CharactersPolicy.ts";

/** What a character's check reads of its link to the campaign: the player who linked it, and how they linked it. */
interface CharacterLink {
  playerId: string;
  visibility: CharacterVisibility;
}

/** What a campaign's checks read of it. */
type PolicyCampaign = Pick<Campaign, "id" | "deletedAt" | "rulesetId">;

export default class CampaignsPolicy extends BasePolicy<PolicyCampaign> {
  constructor(session: Session, entity: PolicyCampaign, player: Player | null = null) {
    super(session, entity);
    this.player = player;
  }

  /**
   * The session's policy on `campaign`: its rights come from its live player row, an archived campaign's too (archiving
   * a campaign leaves its seats alone; a seat is archived only with its user's account). The PDF worker passes the
   * export's user.
   */
  static async for(db: Db, session: Session, campaign: PolicyCampaign) {
    return (await CampaignsPolicy.forMany(db, session, [campaign])).get(campaign.id)!;
  }

  /** The session's policies on a page of campaigns (`campaigns`), by id, each as `for` builds one: its seats read at once. */
  static async forMany(db: Db, session: Session, campaigns: PolicyCampaign[]) {
    const players = await Players.findMany(db, { campaignIds: campaigns.map(({ id }) => id), userId: session.userId });
    const seats = new Map(players.map((player) => [player.campaignId, player]));
    return new Map(
      campaigns.map((campaign) => [
        campaign.id,
        new CampaignsPolicy(session, campaign, seats.get(campaign.id) ?? null),
      ]),
    );
  }

  private readonly player: Player | null;

  private canDelete() {
    if (!this.isGameMaster()) throw new ForbiddenError("Only the Game Master can manage this campaign");

    return true;
  }

  /**
   * Accepting an invite (`invite`) to a seat in the campaign: a pending one (`canAnswerInvite`), to one that isn't
   * archived (`canModify`), by who holds no seat in it yet (an invite they took over with an address, while seated
   * under another).
   */
  canAcceptInvite(invite: { status: string }) {
    this.canAnswerInvite(invite);
    this.canModify();

    if (this.player) throw new ConflictError("You already hold a seat in this campaign");

    return true;
  }

  /** Archiving the campaign: the Game Master's (`canDelete`), while it isn't archived (`canModify`). */
  canArchive() {
    this.canDelete();
    return this.canModify();
  }

  /** Editing the campaign's name and description: the Game Master's (`canUpdate`), while it isn't archived. */
  canEdit() {
    this.canUpdate();
    return this.canModify();
  }

  /**
   * Exporting a character linked to the campaign as a PDF, from the campaign: its Game Master's, or whoever exports it
   * themselves (`character`, the session's policy on it: `canExport`, its editors', a demo's refused), but a demo
   * Game Master's (`canUseSignedUpFeatures`).
   */
  canExportCharacter(character: CharactersPolicy) {
    if (!this.isGameMaster()) return character.canExport();

    return this.canUseSignedUpFeatures();
  }

  canHardDelete() {
    if (!this.isGameMaster()) throw new ForbiddenError("Only the Game Master can permanently delete this campaign");

    if (!this.entity.deletedAt) throw new ConflictError("Only archived campaigns can be permanently deleted");

    return true;
  }

  /**
   * Inviting someone to a seat (`player`): a seat archived with its user's account refused as not found first, as
   * `canUpdatePlayer` and `canRemovePlayer` refuse it; then its Game Master's (`canManagePlayers`), to a seat no user
   * holds, without a pending invite (`pendingInvite`): either is the seat's state.
   */
  canInviteToSeat(player: Pick<Player, "deletedAt" | "userId">, { pendingInvite }: { pendingInvite: boolean }) {
    if (player.deletedAt) throw new NotFoundError("Player not found in this campaign");

    this.canManagePlayers();

    if (player.userId) throw new ConflictError("Player already has a user assigned");

    if (pendingInvite) throw new ConflictError("This player slot already has a pending invite");

    return true;
  }

  /**
   * Linking a character to the campaign, listing those the session could link, and setting the visibility of one it
   * linked (`canSetCharacterVisibility`): its seat (returned, `canRead`), in a campaign that isn't archived
   * (`canModify`). The character a link names (`character`, its policy, and its link if it has one, `link`) is another
   * record, checked after who, before the campaign's state: its policy's `canLink`, from the seat.
   */
  canLinkCharacter(character?: CharactersPolicy, link?: { playerId: string }) {
    const player = this.canRead();
    character?.canLink(this.entity, { link, seat: player });
    this.canModify();
    return player;
  }

  /**
   * Adding, editing, moving and removing the campaign's folders and documents, and choosing whom each admits: its Game
   * Master's, but a demo's (`canUseSignedUpFeatures`), in a campaign that isn't archived.
   */
  canManageDocuments() {
    this.canUpdate();
    this.canUseSignedUpFeatures();
    return this.canModify();
  }

  /**
   * Adding, editing and removing the campaign's players: its Game Master's, but a demo's (`canUseSignedUpFeatures`), in
   * a campaign that isn't archived.
   */
  canManagePlayers() {
    this.canUpdate();
    this.canUseSignedUpFeatures();
    return this.canModify();
  }

  /** An archived campaign is read-only, in one refusal whatever is asked of it: an edit, an archive, an accept. */
  canModify() {
    if (this.entity.deletedAt) throw new ConflictError("This campaign is archived");
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
   * Removing a seat (`player`) from the campaign: a seat archived with its user's account, which no one holds, refused
   * as not found first; then its own player leaving it, while it isn't archived (`canModify`), or another's removal, its
   * Game Master's (`canManagePlayers`); never its last Game Master (`isLastGameMaster`), whom the campaign keeps.
   */
  canRemovePlayer(player: Pick<Player, "deletedAt" | "userId">, { isLastGameMaster }: { isLastGameMaster: boolean }) {
    if (player.deletedAt) throw new NotFoundError("Player not found in this campaign");

    if (player.userId === this.session.userId) this.canModify();
    else this.canManagePlayers();

    if (isLastGameMaster) throw new ConflictError("Cannot remove the last Game Master from a campaign");

    return true;
  }

  /**
   * Revoking an invite to one of the campaign's seats: its Game Master's (`canUpdate`), an archived campaign's too; one
   * that's pending (`status`), as neither an answered nor a revoked one is.
   */
  canRevokeInvite({ status }: { status?: string } = {}) {
    this.canUpdate();

    if (status !== undefined && status !== "Pending") throw new ConflictError("Only pending invites can be revoked");

    return true;
  }

  /**
   * Whether the session sees the campaign's character `link`: a member does, but a Private one is its player's and the
   * Game Master's alone, refused to the others as not linked (a 404), as an unknown character is.
   */
  canSeeCharacter(link: CharacterLink) {
    this.canRead();
    if (link.visibility === "Private" && !this.isLinkOwner(link) && !this.isGameMaster())
      throw new NotFoundError("Character not found in this campaign");

    return true;
  }

  /**
   * The campaign's linked characters the session sees, as a filter of its links (`canRead` first): every one for the
   * Game Master; a player's, all but the Private ones of other seats (`visibilityPlayerId`: theirs), as
   * `canSeeCharacter` decides one.
   */
  canSeeCharacters() {
    const player = this.canRead();
    return { visibilityPlayerId: this.isGameMaster() ? undefined : player.id };
  }

  /**
   * Seeing one of the campaign's folders or documents (`audience`: the players it and every folder above it admit): a
   * member, but a player only one its audience takes in, refused to the others as not found (a 404), so a hidden
   * folder's or document's existence isn't revealed.
   */
  canSeeDocument(audience: DocumentAudience) {
    this.canRead();
    if (!this.isDocumentReader(audience)) throw new NotFoundError("Document not found in this campaign");

    return true;
  }

  /**
   * Setting the visibility of a character linked to the campaign (`link`, none for one that isn't): the seat that linked
   * it, whose link it is, in a campaign that isn't archived, as `canLinkCharacter` takes a link. One the session doesn't
   * see (`canSeeCharacter`: another seat's Private one), or none, is refused as not linked (a 404), as the campaign's
   * other routes on a character refuse it: who and the link, then the campaign's state.
   */
  canSetCharacterVisibility(link: CharacterLink | undefined) {
    const player = this.canRead();

    if (!link) throw new NotFoundError("Character not found in this campaign");
    this.canSeeCharacter(link);
    if (!this.isLinkOwner(link)) throw new ForbiddenError("You do not own this character in this campaign");

    this.canModify();
    return player;
  }

  /** Unarchiving the campaign: the Game Master's (`canDelete`), once it's archived. */
  canUnarchive() {
    this.canDelete();

    if (!this.entity.deletedAt) throw new ConflictError("Campaign is not archived");

    return true;
  }

  canUpdate() {
    if (!this.isGameMaster()) throw new ForbiddenError("Only the Game Master can edit this campaign");

    return true;
  }

  /**
   * Changing a seat (`player`): a seat archived with its user's account refused as not found first; then its Game
   * Master's (`canManagePlayers`), to a role (`role`, none for an edit that may change it); never its last Game Master's
   * demotion (`isLastGameMaster`), which a role left unsaid may be.
   */
  canUpdatePlayer(
    player: Pick<Player, "deletedAt">,
    { isLastGameMaster, role }: { isLastGameMaster: boolean; role?: CampaignRole },
  ) {
    if (player.deletedAt) throw new NotFoundError("Player not found in this campaign");

    this.canManagePlayers();

    if (isLastGameMaster && role !== "Game Master") throw new ConflictError("Cannot demote the last Game Master");

    return true;
  }

  /**
   * Whether the session reads the campaign's email addresses, its player slots' and its invites', and searches them by
   * an address: its Game Master's to read. In the players list, a player reads their own slot's alone
   * (`isSlotAddressReader`).
   */
  isAddressReader() {
    return this.isGameMaster();
  }

  /**
   * Whether the session reads a folder or a document of the campaign (`audience`: the players it and every folder above
   * it admit): its Game Master reads every one, a player one its audience takes their seat in.
   */
  isDocumentReader(audience: DocumentAudience) {
    if (this.isGameMaster()) return true;

    return !!this.player && isInDocumentAudience(audience, this.player.id);
  }

  /** Whether the session's player row is the campaign's Game Master's. */
  isGameMaster() {
    return this.player?.role === "Game Master";
  }

  /** Whether a character's link to the campaign (`link`) is on the session's seat: its own, or one handed on to it. */
  isLinkOwner(link: Pick<CharacterLink, "playerId">) {
    return !!this.player && link.playerId === this.player.id;
  }

  /**
   * Whether the session reads a linked character (`link`; `character`, the session's policy on it) partially: a
   * Partial one shows its name and physical traits alone to an incidental viewer, but its player, the Game Master and
   * its editors (its owner, an active contributor) read it whole.
   */
  isPartialReader(link: CharacterLink, character: CharactersPolicy) {
    return link.visibility === "Partial" && !this.isLinkOwner(link) && !this.isGameMaster() && !character.isEditor();
  }

  /**
   * Whether the session reads a linked character's private notes (`character`, its policy on it): whoever reads them of
   * the character itself (its editors: `CharactersPolicy.isPrivateNotesReader`), and the Game Master.
   */
  isPrivateNotesReader(character: CharactersPolicy) {
    return character.isPrivateNotesReader() || this.isGameMaster();
  }

  /** Whether the session may read the campaign: it holds a live seat in it, Player or Game Master. */
  isReadable() {
    return this.player !== null;
  }

  /** Whether the session reads the addresses of a player slot (`userId`, the user who holds it): all, or its own. */
  isSlotAddressReader(userId: string | null | undefined) {
    return this.isAddressReader() || userId === this.session.userId;
  }
}
