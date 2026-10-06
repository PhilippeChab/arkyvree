import type { Db } from "@/server/database/index.ts";
import { ConflictError, ForbiddenError, UnprocessableEntityError } from "@/server/errors/index.ts";
import { CharacterContributors } from "@/server/repositories/index.ts";
import type { Character, Session } from "@/shared/relations.ts";

import BasePolicy from "./BasePolicy.ts";

export default class CharactersPolicy extends BasePolicy<Character> {
  constructor(session: Pick<Session, "userId">, entity: Character, isActiveContributor = false) {
    super(session, entity);
    this.isActiveContributor = isActiveContributor;
  }

  /** The session's policy on `character`: a contributor's rights come from their active role on it. */
  static async for(db: Db, session: Session, character: Character) {
    const role =
      character.userId === session.userId
        ? null
        : await CharacterContributors.findRole(db, { userId: session.userId, characterId: character.id });
    return new CharactersPolicy(session, character, role !== null);
  }

  private readonly isActiveContributor: boolean;

  private get isOwner() {
    return this.entity.userId === this.session.userId;
  }

  /** `inActiveCampaign`: the character is linked to a campaign that isn't archived. */
  canHardDelete({ inActiveCampaign }: { inActiveCampaign: boolean }) {
    if (!this.isOwner) {
      throw new ForbiddenError("Only the owner can permanently delete this character");
    }
    if (!this.entity.deletedAt) {
      throw new UnprocessableEntityError("Only archived characters can be permanently deleted");
    }
    if (inActiveCampaign) {
      throw new ConflictError(
        "This character is linked to an active campaign and cannot be permanently deleted. Remove it from the campaign first.",
      );
    }
    return true;
  }

  canManageContributors() {
    if (!this.isOwner) {
      throw new ForbiddenError("Only the owner can manage contributors");
    }
    return true;
  }

  canReadContributors() {
    if (!this.isOwner && !this.isActiveContributor) {
      throw new ForbiddenError("You are not a contributor of this character");
    }
    return true;
  }
}
