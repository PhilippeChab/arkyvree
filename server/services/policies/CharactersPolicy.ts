import { db } from "@/server/database/index.ts";
import { ConflictError, ForbiddenError, UnprocessableEntityError } from "@/server/errors/index.ts";
import { PlayerCharacters } from "@/server/repositories/index.ts";
import type { Character, Session } from "@/shared/relations.ts";
import BasePolicy from "./BasePolicy.ts";

export default class CharactersPolicy extends BasePolicy<Character> {
  private readonly isActiveContributor: boolean;

  constructor(session: Session, entity: Character, isActiveContributor = false) {
    super(session, entity);
    this.isActiveContributor = isActiveContributor;
  }

  private get isOwner() {
    return this.entity.userId === this.session.userId;
  }

  canCreate() {
    return true;
  }

  canRead() {
    return true;
  }

  canUpdate() {
    if (!this.isOwner && !this.isActiveContributor) {
      throw new ForbiddenError("Only the owner or active contributors can edit this character");
    }
    if (this.entity.deletedAt) {
      throw new UnprocessableEntityError("Archived characters are read-only");
    }
    return true;
  }

  canDelete() {
    if (!this.isOwner) {
      throw new ForbiddenError("Only the owner can archive this character");
    }
    return true;
  }

  async canHardDelete() {
    if (!this.isOwner) {
      throw new ForbiddenError("Only the owner can permanently delete this character");
    }
    if (!this.entity.deletedAt) {
      throw new UnprocessableEntityError("Only archived characters can be permanently deleted");
    }
    const linkedActive = await PlayerCharacters.existsInActiveCampaign(db, { characterId: this.entity.id });
    if (linkedActive) {
      throw new ConflictError("This character is linked to an active campaign and cannot be permanently deleted. Remove it from the campaign first.");
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
