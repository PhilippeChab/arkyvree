import type { Db } from "@/drizzle/database.ts";
import { Engine } from "@/engine/index.ts";
import { ConflictError, ForbiddenError, NotFoundError, UnprocessableEntityError } from "@/server/errors/index.ts";
import { CharacterContributors, Characters, PlayerCharacters, Visibility } from "@/server/repositories/index.ts";
import type { Campaign, Character, Player, Session, User } from "@/shared/relations.ts";

import BasePolicy from "./BasePolicy.ts";
import { isAllowed } from "./isAllowed.ts";

/** Where a character's link to a campaign is made from: the session's seat, and the character's link if it has one. */
interface LinkSeat {
  link?: { playerId: string };
  seat: Pick<Player, "id">;
}

/** The session's standing on a character beyond owning it (`CharactersPolicy`'s flags of the same names). */
export interface CharacterStanding {
  isActiveContributor?: boolean;
  isCampaignGameMaster?: boolean;
  isParentArchived?: boolean;
  isParentEditor?: boolean;
}

/**
 * What refuses an archived character, or a child of one, whatever is asked of it: on its state (a 409), an edit, its
 * rows' edit, its portrait's change, an archive, a contributor's invite, an invite's accept; and as another record a
 * request names (a 422), its link to a campaign.
 */
const ARCHIVED_CHARACTER = "This character is archived";

/**
 * Whether a character is a player character, not another's child (3.5's bonded creatures): its kind its own base rules'
 * player character's (`StorageEngine.isPlayerKind`).
 */
function isPlayerCharacter(character: Character) {
  return Engine.forRules(character.baseRules).storage().isPlayerKind(character.kind);
}

export default class CharactersPolicy extends BasePolicy<Character> {
  constructor(
    session: Session,
    entity: Character,
    {
      isActiveContributor = false,
      isCampaignGameMaster = false,
      isParentArchived = false,
      isParentEditor = false,
    }: CharacterStanding = {},
  ) {
    super(session, entity);
    this.isActiveContributor = isActiveContributor;
    this.isCampaignGameMaster = isCampaignGameMaster;
    this.isParentArchived = isParentArchived;
    this.isParentEditor = isParentEditor;
  }

  /**
   * The session's policy on `character`: a player character's contributor's rights come from their active role on it,
   * a Game Master's from their seat in the live campaign it's linked to, and a child's (3.5's bonded creature) from the
   * session's on its parent, a player character, archived or not (an archived parent's child is read-only, as the
   * parent is).
   */
  static async for(db: Db, session: Session, character: Character): Promise<CharactersPolicy> {
    if (!isPlayerCharacter(character)) {
      const parent = character.parentCharacterId
        ? await Characters.findOne(db, { id: character.parentCharacterId }, Visibility.All)
        : undefined;
      const isParentEditor =
        !!parent && isPlayerCharacter(parent) && (await CharactersPolicy.for(db, session, parent)).isEditor();
      return new CharactersPolicy(session, character, { isParentArchived: !!parent?.deletedAt, isParentEditor });
    }

    if (character.userId === session.userId) return new CharactersPolicy(session, character);

    const role = await CharacterContributors.findRole(db, { userId: session.userId, characterId: character.id });
    const mastered = await PlayerCharacters.findCharacterIds(db, {
      campaignArchived: false,
      characterIds: [character.id],
      gameMasterId: session.userId,
    });
    return new CharactersPolicy(session, character, {
      isActiveContributor: role !== undefined,
      isCampaignGameMaster: mastered.length > 0,
    });
  }

  /**
   * The session's policies on a page of characters (`characters`), by id, each what `for` builds: its active
   * contributions to the page's player characters and its Game Master's seats in their campaigns read at once, and a
   * child's standing on its parent as `for` reads it.
   */
  static async forMany(db: Db, session: Session, characters: Character[]): Promise<Map<string, CharactersPolicy>> {
    // The page's player characters of others', which the session may edit as a contributor or as a Game Master
    const othersIds = characters
      .filter((character) => isPlayerCharacter(character) && character.userId !== session.userId)
      .map((character) => character.id);
    const contributions = await CharacterContributors.findMany(db, {
      characterIds: othersIds,
      status: "Active",
      userId: session.userId,
    });
    const contributedIds = new Set(contributions.map((contribution) => contribution.characterId));
    const masteredIds = new Set(
      await PlayerCharacters.findCharacterIds(db, {
        campaignArchived: false,
        characterIds: othersIds,
        gameMasterId: session.userId,
      }),
    );
    const policies = new Map<string, CharactersPolicy>();
    for (const character of characters) {
      const policy = isPlayerCharacter(character)
        ? new CharactersPolicy(session, character, {
            isActiveContributor: contributedIds.has(character.id),
            isCampaignGameMaster: masteredIds.has(character.id),
          })
        : await CharactersPolicy.for(db, session, character);
      policies.set(character.id, policy);
    }
    return policies;
  }

  /**
   * The session is a Game Master of the campaign the player character is linked to, a live one, from a live seat:
   * looked up only for one it doesn't own.
   */
  private readonly isCampaignGameMaster: boolean;

  /** The child's parent is archived: looked up only for a child. */
  private readonly isParentArchived: boolean;

  /** Edits the child's parent (owns it, or actively contributes to it): looked up only for a child. */
  private readonly isParentEditor: boolean;

  /** The session actively contributes to the player character: looked up only for one it doesn't own. */
  readonly isActiveContributor: boolean;

  /**
   * A player character's owner alone, archived or not: anyone else, its contributors and a child's editors too, gets
   * the answer an unknown character gets.
   */
  private canOwn() {
    if (!this.isPlayerCharacter || !this.isOwner) throw new NotFoundError("Character not found");

    return true;
  }

  /** Neither the character nor a child's parent is archived: what an edit of it refuses on its state otherwise (a 409). */
  private checkUnarchived() {
    if (this.entity.deletedAt || this.isParentArchived) throw new ConflictError(ARCHIVED_CHARACTER);

    return true;
  }

  private get isOwner() {
    return this.entity.userId === this.session.userId;
  }

  private get isPlayerCharacter() {
    return isPlayerCharacter(this.entity);
  }

  /**
   * Accepting an invite (`invite`) to contribute to the character: a pending one (`canAnswerInvite`), to one that isn't
   * archived, which no one edits.
   */
  canAcceptInvite(invite: { status: string }) {
    this.canAnswerInvite(invite);

    if (this.entity.deletedAt) throw new ConflictError(ARCHIVED_CHARACTER);

    return true;
  }

  /** Archiving the character: its owner's (`canOwn`), while it isn't archived. */
  canArchive() {
    this.canOwn();

    if (this.entity.deletedAt) throw new ConflictError(ARCHIVED_CHARACTER);

    return true;
  }

  /**
   * Editing the character (its sheet's fields and picks, its picker's options): its readers (`isReadable`), anyone
   * else the 404 an unknown character gets; while neither it nor a child's parent is archived, a refusal on its state
   * (a 409), as an archived ruleset's or campaign's edit is.
   */
  canEdit() {
    if (!this.isReadable()) throw new NotFoundError("Character not found");

    return this.checkUnarchived();
  }

  /**
   * Changing the character's portrait: its readers (`isReadable`), anyone else the 404 an unknown character gets; of
   * them, a player character's owner alone (its contributors and its campaign's Game Masters edit the sheet, not it)
   * and a child's editors, but a demo's, which stores no file (`canUseSignedUpFeatures`), each a 403; while neither it
   * nor a child's parent is archived, a refusal on its state (a 409), as its edit's (`canEdit`).
   */
  canEditPortrait() {
    if (!this.isReadable()) throw new NotFoundError("Character not found");

    if (this.isPlayerCharacter && !this.isOwner) throw new ForbiddenError("Only the owner can change the portrait");

    this.canUseSignedUpFeatures();
    return this.checkUnarchived();
  }

  /**
   * Editing the character's own rows (its levels, scores, inventory, modifiers, and the reads its edits make): who reads
   * them (`canReadRows`), while it isn't archived, a refusal on its state (a 409).
   */
  canEditRows() {
    this.canReadRows();

    if (this.entity.deletedAt) throw new ConflictError(ARCHIVED_CHARACTER);

    return true;
  }

  /**
   * Exporting the character as a PDF: its editors', while they may edit it (`isEditable`: neither it nor a child's
   * parent is archived), but a demo's (`canUseSignedUpFeatures`). Anyone else gets the 404 an unknown character gets.
   */
  canExport() {
    if (!this.isEditable()) throw new NotFoundError("Character not found");

    return this.canUseSignedUpFeatures();
  }

  /** `inActiveCampaign`: the character is linked to a campaign that isn't archived. */
  canHardDelete({ inActiveCampaign }: { inActiveCampaign: boolean }) {
    this.canOwn();

    if (!this.entity.deletedAt) throw new ConflictError("Only archived characters can be permanently deleted");

    if (inActiveCampaign) {
      throw new ConflictError(
        "This character is linked to an active campaign and cannot be permanently deleted. Remove it from the campaign first.",
      );
    }
    return true;
  }

  /**
   * Inviting a contributor: managing them (`canManageContributors`); a user (`invitee`, an account the address has) other
   * than its owner, who contributes as no one (a 422); on a character that isn't archived.
   */
  canInviteContributors({ invitee }: { invitee?: Pick<User, "id"> } = {}) {
    this.canManageContributors();

    if (invitee && invitee.id === this.entity.userId)
      throw new UnprocessableEntityError("Cannot invite the character owner as a contributor");

    if (this.entity.deletedAt) throw new ConflictError(ARCHIVED_CHARACTER);

    return true;
  }

  /**
   * Leaving its contributors: one who reads them (`canReadContributors`, the 404 an unknown character gets for anyone
   * else), and contributes to it actively; its owner contributes as no one, answered as not found.
   */
  canLeave() {
    this.canReadContributors();

    if (!this.isActiveContributor) throw new NotFoundError("You are not a contributor of this character");

    return true;
  }

  /**
   * Linking the character to a campaign (`campaign`) from the session's seat in it (`seat`): its owner's (`canOwn`); a
   * character the campaign can take, another record than the campaign, each a 422 otherwise: one built on the
   * campaign's own ruleset, that isn't archived, and that another seat's link (`link`, another campaign's) doesn't
   * hold; then, linked from the seat already, the campaign's own link, a 409 on its state.
   */
  canLink(campaign: Pick<Campaign, "rulesetId">, { link, seat }: LinkSeat) {
    this.canOwn();

    // The campaign's exact ruleset: not a fork of it, nor its parent
    if (this.entity.rulesetId !== campaign.rulesetId)
      throw new UnprocessableEntityError("Only characters built on the campaign's ruleset can be linked");

    if (this.entity.deletedAt) throw new UnprocessableEntityError(ARCHIVED_CHARACTER);

    if (link && link.playerId !== seat.id)
      throw new UnprocessableEntityError("Character is already linked to a campaign");

    if (link) throw new ConflictError("Character already linked to this campaign");

    return true;
  }

  /**
   * Managing its contributors, what inviting and revoking one start with: its owner's, among those who read them, but a
   * demo's (`canUseSignedUpFeatures`).
   */
  canManageContributors() {
    this.canReadContributors();

    if (!this.isOwner) throw new ForbiddenError("Only the owner can manage contributors");

    return this.canUseSignedUpFeatures();
  }

  /**
   * Reading its contributors, and leaving them: who reads its own rows (`canReadRows`), its editors, as a child has
   * none.
   */
  canReadContributors() {
    return this.canReadRows();
  }

  /**
   * Reading the character's own rows (its inventory's and its modifiers' lists), archived or not, and what editing them
   * starts with (`canEditRows`): its editors (`isEditor`). Anyone else, a child's parent's editors too (its own rows are
   * its parent's), gets the 404 an unknown character gets.
   */
  canReadRows() {
    if (!this.isEditor()) throw new NotFoundError("Character not found");

    return true;
  }

  /**
   * Revoking a contributor: managing them (`canManageContributors`); one who contributes or is invited (`status`), as
   * neither a revoked nor a rejected one does.
   */
  canRevokeContributor({ status }: { status: string }) {
    this.canManageContributors();

    if (status !== "Active" && status !== "Pending") throw new ConflictError("Contributor is not active or pending");

    return true;
  }

  /**
   * Creating and revoking its share link: its owner's (`canOwn`), but a demo's (`canUseSignedUpFeatures`), while it
   * isn't archived, which puts it out of the link's reach as an unknown character is.
   */
  canShare() {
    this.canOwn();
    this.canUseSignedUpFeatures();

    if (this.entity.deletedAt) throw new NotFoundError("Character not found");

    return true;
  }

  /** Unarchiving the character: its owner's (`canOwn`), once it's archived. */
  canUnarchive() {
    this.canOwn();

    if (!this.entity.deletedAt) throw new ConflictError("Character is not archived");

    return true;
  }

  /**
   * Whether the session may edit the character (`canEdit`): its readers, while neither it nor a child's parent is
   * archived.
   */
  isEditable() {
    return isAllowed(() => this.canEdit());
  }

  /**
   * Whether the session edits a player character itself, its own rows (its levels, scores, inventory, modifiers)
   * included, archived or not: its owner, an active contributor, or a Game Master of the live campaign it's linked to. A
   * child's are its parent's: it has no editor of its own.
   */
  isEditor() {
    return this.isPlayerCharacter && (this.isOwner || this.isActiveContributor || this.isCampaignGameMaster);
  }

  /**
   * Whether the session may link the character to a campaign (`campaign`) from its seat (`from`: the seat, and the
   * character's link if it has one), as `canLink` decides it: what the campaign's link dialog lists.
   */
  isLinkable(campaign: Pick<Campaign, "rulesetId">, from: LinkSeat) {
    return isAllowed(() => this.canLink(campaign, from));
  }

  /**
   * Whether the session may change the character's portrait (`canEditPortrait`): a player character's owner, a child's
   * editors, while neither it nor a child's parent is archived, never a demo's.
   */
  isPortraitEditable() {
    return isAllowed(() => this.canEditPortrait());
  }

  /** Whether the session reads the character's private notes: whoever reads it (`isReadable`). */
  isPrivateNotesReader() {
    return this.isReadable();
  }

  /**
   * Whether the session may read the character, archived or not: a player character's editors (its owner, its active
   * contributors and its live campaign's Game Masters), and a child's parent's.
   */
  isReadable() {
    return this.isPlayerCharacter ? this.isEditor() : this.isParentEditor;
  }

  /**
   * Whether the session may edit the character's own rows (`canEditRows`): its editors, while it isn't archived. A
   * child's (3.5's bonded creature's) are none: its own rows are its parent's.
   */
  isRowEditable() {
    return isAllowed(() => this.canEditRows());
  }
}
