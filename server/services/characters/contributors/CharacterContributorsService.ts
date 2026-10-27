import type { Db } from "@/drizzle/database.ts";
import { Engine } from "@/engine/index.ts";
import { db, withTransaction } from "@/server/database/index.ts";
import { emailService, EmailTemplate } from "@/server/emails/index.ts";
import { ConflictError, NotFoundError } from "@/server/errors/index.ts";
import { CharacterContributors, Characters, Users, Visibility } from "@/server/repositories/index.ts";
import { createActivityWithNotifications } from "@/server/services/activities/index.ts";
import { toPublicUser } from "@/server/services/authentication/index.ts";
import {
  checkNewContributor,
  getInviteNames,
  getPendingInvite,
  saveInviteAnswer,
} from "@/server/services/invites/index.ts";
import { CharactersPolicy } from "@/server/services/policies/index.ts";
import { TARGET_TYPES } from "@/shared/activityTargets.ts";
import type { Session } from "@/shared/relations.ts";

/** What an invite the session's user can't answer, or see, is refused with: it doesn't reveal whether it exists. */
const INVITE_NOT_FOUND = "Contributor invite not found";

class CharacterContributorsService {
  /** The invitee's answer, which its character's owner is told of. */
  private async answerInvite(
    tx: Db,
    session: Session,
    contributor: { characterId: string; id: string },
    characterName: string | undefined,
    status: "Active" | "Rejected",
  ) {
    return await saveInviteAnswer(tx, session, CharacterContributors, contributor.id, status, {
      targetType: TARGET_TYPES.characterContributors,
      type: status === "Active" ? "acceptCharacterContributorInvite" : "rejectCharacterContributorInvite",
      data: { contributorId: contributor.id, characterId: contributor.characterId, characterName },
    });
  }

  async acceptInvite(session: Session, contributorId: string) {
    return await withTransaction(async (tx) => {
      const contributor = await getPendingInvite(tx, session, CharacterContributors, contributorId, INVITE_NOT_FOUND);

      const character = await Characters.findOne(tx, { id: contributor.characterId }, Visibility.All);
      if (!character) throw new NotFoundError("Character not found");

      if (character.deletedAt) throw new ConflictError("This character has been archived and can no longer be edited");

      return await this.answerInvite(tx, session, contributor, character.name, "Active");
    });
  }

  async getContributors(
    session: Session,
    characterId: string,
    where: {
      orderBy?: "createdAt" | "updatedAt";
      orderDir?: "asc" | "desc";
      search?: string;
    },
    pagination: { limit: number; page: number },
  ) {
    const character = await Characters.findOne(db, { id: characterId }, Visibility.All);
    if (!character || !Engine.storage().isPlayerKind(character.kind)) throw new NotFoundError("Character not found");

    (await CharactersPolicy.for(db, session, character)).canReadContributors();

    const paginated = await CharacterContributors.findPage(db, { characterId, ...where }, pagination);
    const ownerUser = await Users.findOne(db, { id: character.userId });
    return { ...paginated, owner: ownerUser ? toPublicUser(ownerUser) : null };
  }

  // Single invite for the current user, any status. Used by the invite-accept
  // page so a stale link still resolves to "Already accepted" / "no longer
  // pending" copy instead of "Not found".
  async getInvite(session: Session, contributorId: string) {
    const invite = await CharacterContributors.findOneWithCharacter(db, {
      id: contributorId,
      userId: session.userId,
    });
    if (!invite) throw new NotFoundError(INVITE_NOT_FOUND);

    return invite;
  }

  async inviteContributor(session: Session, characterId: string, email: string) {
    const { contributor, emailData } = await withTransaction(async (tx) => {
      const character = await Characters.findOne(tx, { id: characterId }, Visibility.All);
      if (!character || !Engine.storage().isPlayerKind(character.kind)) throw new NotFoundError("Character not found");

      (await CharactersPolicy.for(tx, session, character)).canManageContributors();

      if (character.deletedAt) throw new ConflictError("Cannot invite a contributor to an archived character");

      const user = await Users.findOne(tx, { emailAddress: email });

      if (user && user.id === character.userId)
        throw new ConflictError("Cannot invite the character owner as a contributor");

      await checkNewContributor(tx, CharacterContributors, { characterId }, user, email);

      const rows = await CharacterContributors.create(tx, {
        characterId,
        email,
        role: "Editor",
        invitedBy: session.userId,
        userId: user?.id,
      });
      const contributor = rows[0];

      await createActivityWithNotifications(tx, {
        userId: session.userId,
        targetId: contributor.id,
        targetType: TARGET_TYPES.characterContributors,
        type: "inviteCharacterContributor",
        data: { email, characterId, characterName: character.name },
      });

      const names = await getInviteNames(tx, session, user, email);

      return {
        contributor,
        emailData: {
          email,
          ...names,
          characterName: character.name,
          contributorId: contributor.id,
        },
      };
    });

    emailService.send({
      to: emailData.email,
      subject: `You've been invited to contribute to ${emailData.characterName}`,
      template: EmailTemplate.CharacterContributorInvitation,
      props: {
        inviteeName: emailData.inviteeName,
        inviterName: emailData.inviterName,
        characterName: emailData.characterName,
        contributorId: emailData.contributorId,
      },
    });

    return contributor;
  }

  async leaveCharacter(session: Session, characterId: string) {
    return await withTransaction(async (tx) => {
      const character = await Characters.findOne(tx, { id: characterId }, Visibility.All);
      if (!character || !Engine.storage().isPlayerKind(character.kind)) throw new NotFoundError("Character not found");

      const contributor = await CharacterContributors.findOne(tx, {
        characterId,
        userId: session.userId,
        status: "Active",
      });
      if (!contributor) throw new NotFoundError("You are not a contributor of this character");

      const rows = await CharacterContributors.update(tx, { status: "Revoked" }, { id: contributor.id });
      const updated = rows[0];

      await createActivityWithNotifications(tx, {
        userId: session.userId,
        targetId: updated.id,
        targetType: TARGET_TYPES.characterContributors,
        type: "leaveCharacter",
        data: { characterId, characterName: character.name },
      });

      return updated;
    });
  }

  async rejectInvite(session: Session, contributorId: string) {
    return await withTransaction(async (tx) => {
      const contributor = await getPendingInvite(tx, session, CharacterContributors, contributorId, INVITE_NOT_FOUND);

      const character = await Characters.findOne(tx, { id: contributor.characterId }, Visibility.All);

      return await this.answerInvite(tx, session, contributor, character?.name, "Rejected");
    });
  }

  async revokeContributor(session: Session, contributorId: string) {
    return await withTransaction(async (tx) => {
      const contributor = await CharacterContributors.findOne(tx, { id: contributorId });
      if (!contributor) throw new NotFoundError("Contributor not found");

      const character = await Characters.findOne(tx, { id: contributor.characterId }, Visibility.All);
      if (!character) throw new NotFoundError("Character not found");

      (await CharactersPolicy.for(tx, session, character)).canManageContributors();

      if (contributor.status !== "Active" && contributor.status !== "Pending")
        throw new ConflictError("Contributor is not active or pending");

      const prevStatus = contributor.status;
      const rows = await CharacterContributors.update(tx, { status: "Revoked" }, { id: contributorId });
      const updated = rows[0];

      await createActivityWithNotifications(tx, {
        userId: session.userId,
        targetId: updated.id,
        targetType: TARGET_TYPES.characterContributors,
        type: "revokeCharacterContributor",
        data: { contributorId, prevStatus, characterId: contributor.characterId, characterName: character.name },
      });

      return updated;
    });
  }
}

export default new CharacterContributorsService();
