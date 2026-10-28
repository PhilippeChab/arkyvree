import type { Db } from "@/drizzle/database.ts";
import { Engine } from "@/engine/index.ts";
import { ConflictError, ForbiddenError, NotFoundError, UnprocessableEntityError } from "@/server/errors/index.ts";
import { CharacterContributors, Characters, Visibility } from "@/server/repositories/index.ts";
import type { Character, Session } from "@/shared/relations.ts";

import BasePolicy from "./BasePolicy.ts";

/** The session's standing on a character beyond owning it (`CharactersPolicy`'s flags of the same names). */
export interface CharacterStanding {
  isActiveContributor?: boolean;
  isParentArchived?: boolean;
  isParentEditor?: boolean;
}

export default class CharactersPolicy extends BasePolicy<Character> {
  constructor(
    session: Pick<Session, "userId">,
    entity: Character,
    { isActiveContributor = false, isParentArchived = false, isParentEditor = false }: CharacterStanding = {},
  ) {
    super(session, entity);
    this.isActiveContributor = isActiveContributor;
    this.isParentArchived = isParentArchived;
    this.isParentEditor = isParentEditor;
  }

  /**
   * The session's policy on `character`: a player character's contributor's rights come from their active role on it,
   * and a child's (3.5's bonded creature) from the session's on its parent, a player character, archived or not (an
   * archived parent's child is read-only, as the parent is).
   */
  static async for(db: Db, session: Pick<Session, "userId">, character: Character): Promise<CharactersPolicy> {
    if (!Engine.storage().isPlayerKind(character.kind)) {
      const parent = character.parentCharacterId
        ? await Characters.findOne(db, { id: character.parentCharacterId }, Visibility.All)
        : undefined;
      const isParentEditor =
        !!parent &&
        Engine.storage().isPlayerKind(parent.kind) &&
        (await CharactersPolicy.for(db, session, parent)).isEditor();
      return new CharactersPolicy(session, character, { isParentArchived: !!parent?.deletedAt, isParentEditor });
    }

    const role =
      character.userId === session.userId
        ? undefined
        : await CharacterContributors.findRole(db, { userId: session.userId, characterId: character.id });
    return new CharactersPolicy(session, character, { isActiveContributor: role !== undefined });
  }

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

  private get isOwner() {
    return this.entity.userId === this.session.userId;
  }

  private get isPlayerCharacter() {
    return Engine.storage().isPlayerKind(this.entity.kind);
  }

  /** Archiving the character, unarchiving it and deleting it for good: its owner's (`canOwn`). */
  canArchive() {
    return this.canOwn();
  }

  /** `inActiveCampaign`: the character is linked to a campaign that isn't archived. */
  canHardDelete({ inActiveCampaign }: { inActiveCampaign: boolean }) {
    this.canArchive();

    if (!this.entity.deletedAt)
      throw new UnprocessableEntityError("Only archived characters can be permanently deleted");

    if (inActiveCampaign) {
      throw new ConflictError(
        "This character is linked to an active campaign and cannot be permanently deleted. Remove it from the campaign first.",
      );
    }
    return true;
  }

  /** Inviting a contributor: managing them (`canManageContributors`), on a character that isn't archived. */
  canInviteContributors() {
    this.canManageContributors();

    if (this.entity.deletedAt) throw new ConflictError("Cannot invite a contributor to an archived character");

    return true;
  }

  /** Linking the character to a campaign: its owner's (`canOwn`). */
  canLink() {
    return this.canOwn();
  }

  /** Revoking a contributor, and inviting one: its owner's, among those who read them (`canReadContributors`). */
  canManageContributors() {
    this.canReadContributors();

    if (!this.isOwner) throw new ForbiddenError("Only the owner can manage contributors");

    return true;
  }

  /**
   * Reading its contributors, and leaving them: a player character's editors (`isEditor`), as a child has none. Anyone
   * else gets the 404 an unknown character gets.
   */
  canReadContributors() {
    if (!this.isEditor()) throw new NotFoundError("Character not found");

    return true;
  }

  /**
   * Creating and revoking its share link: its owner's (`canOwn`), while it isn't archived, which puts it out of the
   * link's reach as an unknown character is.
   */
  canShare() {
    this.canOwn();

    if (this.entity.deletedAt) throw new NotFoundError("Character not found");

    return true;
  }

  /**
   * Whether the session may edit the character: its readers (`isReadable`), while neither it nor a child's parent is
   * archived.
   */
  isEditable() {
    return this.isReadable() && !this.entity.deletedAt && !this.isParentArchived;
  }

  /**
   * Whether the session edits a player character itself, its own rows (its levels, scores, inventory, modifiers)
   * included, archived or not: its owner or an active contributor. A child's are its parent's: it has no editor of its
   * own.
   */
  isEditor() {
    return this.isPlayerCharacter && (this.isOwner || this.isActiveContributor);
  }

  /**
   * Whether the session may change the character's portrait: a player character's owner alone (its contributors edit
   * the sheet, not it), a child's editors (`isEditable`), while it isn't archived.
   */
  isPortraitEditable() {
    return this.isEditable() && (!this.isPlayerCharacter || this.isOwner);
  }

  /**
   * Whether the session may read the character, archived or not: a player character's owner and active contributors
   * (its editors), and a child's parent's.
   */
  isReadable() {
    return this.isPlayerCharacter ? this.isEditor() : this.isParentEditor;
  }
}
