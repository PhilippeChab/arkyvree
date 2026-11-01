import type { Db } from "@/drizzle/database.ts";
import { db } from "@/server/database/index.ts";
import { emailService, EmailTemplate } from "@/server/emails/index.ts";
import { ConflictError, NotFoundError } from "@/server/errors/index.ts";
import { CharacterContributors, Characters, type Pagination, Users, Visibility } from "@/server/repositories/index.ts";
import { createActivityWithNotifications } from "@/server/services/activities/index.ts";
import { toPublicUser } from "@/server/services/authentication/index.ts";
import { withCharacterLock } from "@/server/services/characters/characterWrites.ts";
import { findReadableCharacter } from "@/server/services/characters/editableCharacter.ts";
import {
  checkNewContributor,
  getInviteNames,
  getPendingInvite,
  saveInviteAnswer,
} from "@/server/services/invites/index.ts";
import { CharactersPolicy, isAllowed } from "@/server/services/policies/index.ts";
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

  /**
   * Runs a write of an invite (`contributorId`) under its character's lock (`withCharacterLock`, archived or not),
   * which decides the session's rights itself: an unknown invite refused as one the session can't see. An invite's
   * character never changes, so it's read before the lock.
   */
  private async withInviteCharacter<T>(contributorId: string, write: (tx: Db) => Promise<T>) {
    const contributor = await CharacterContributors.findOne(db, { id: contributorId });
    if (!contributor) throw new NotFoundError(INVITE_NOT_FOUND);
    return await withCharacterLock(contributor.characterId, write, {
      notFound: INVITE_NOT_FOUND,
      visibility: Visibility.All,
    });
  }

  async acceptInvite(session: Session, contributorId: string) {
    return await this.withInviteCharacter(contributorId, async (tx) => {
      const contributor = await getPendingInvite(tx, session, CharacterContributors, contributorId, INVITE_NOT_FOUND);

      const character = await Characters.findOne(tx, { id: contributor.characterId }, Visibility.All);
      if (!character) throw new NotFoundError("Character not found");

      (await CharactersPolicy.for(tx, session, character)).canAcceptInvite();

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
    pagination: Pagination,
  ) {
    const character = await Characters.findOne(db, { id: characterId }, Visibility.All);
    if (!character) throw new NotFoundError("Character not found");

    (await CharactersPolicy.for(db, session, character)).canReadContributors();

    const paginated = await CharacterContributors.findPage(db, { characterId, ...where }, pagination);
    const ownerUser = await Users.findOne(db, { id: character.userId });
    return { ...paginated, owner: ownerUser ? toPublicUser(ownerUser) : null };
  }

  /**
   * The session's invite, whatever its status, so a stale link still says what became of it, and whether it may be
   * accepted, as its acceptance asks the character's policy (`canAccept`).
   */
  async getInvite(session: Session, contributorId: string) {
    const invite = await CharacterContributors.findOneWithCharacter(db, {
      id: contributorId,
      userId: session.userId,
    });
    if (!invite) throw new NotFoundError(INVITE_NOT_FOUND);

    const character = await Characters.findOne(db, { id: invite.characterId }, Visibility.All);
    const policy = character && (await CharactersPolicy.for(db, session, character));
    return { ...invite, canAccept: !!policy && isAllowed(() => policy.canAcceptInvite()) };
  }

  async inviteContributor(session: Session, characterId: string, email: string) {
    const { contributor, emailData } = await withCharacterLock(
      characterId,
      async (tx) => {
        const character = await Characters.findOne(tx, { id: characterId }, Visibility.All);
        if (!character) throw new NotFoundError("Character not found");

        (await CharactersPolicy.for(tx, session, character)).canInviteContributors();

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
      },
      { visibility: Visibility.All },
    );

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
    return await withCharacterLock(
      characterId,
      async (tx) => {
        const character = await Characters.findOne(tx, { id: characterId }, Visibility.All);
        if (!character) throw new NotFoundError("Character not found");

        (await CharactersPolicy.for(tx, session, character)).canReadContributors();

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
      },
      { visibility: Visibility.All },
    );
  }

  async rejectInvite(session: Session, contributorId: string) {
    return await this.withInviteCharacter(contributorId, async (tx) => {
      const contributor = await getPendingInvite(tx, session, CharacterContributors, contributorId, INVITE_NOT_FOUND);

      const character = await Characters.findOne(tx, { id: contributor.characterId }, Visibility.All);

      return await this.answerInvite(tx, session, contributor, character?.name, "Rejected");
    });
  }

  /** Revokes a contributor of the character (`characterId`), or its pending invite: another character's is a 404. */
  async revokeContributor(session: Session, characterId: string, contributorId: string) {
    return await withCharacterLock(
      characterId,
      async (tx) => {
        const found = await CharacterContributors.findOne(tx, { id: contributorId });
        const contributor = found?.characterId === characterId ? found : undefined;
        const readable = contributor && (await findReadableCharacter(tx, session, contributor.characterId));
        // A contributor of a character the session may not read is refused as an unknown one is: the character's
        // existence isn't revealed
        if (!contributor || !readable) throw new NotFoundError("Contributor not found");

        const { character, policy } = readable;
        policy.canManageContributors();

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
      },
      { notFound: "Contributor not found", visibility: Visibility.All },
    );
  }
}

export default new CharacterContributorsService();
