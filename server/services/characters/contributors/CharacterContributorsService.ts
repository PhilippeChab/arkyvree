import type { Db } from "@/drizzle/database.ts";
import { db } from "@/server/database/index.ts";
import { emailService, EmailTemplate } from "@/server/emails/index.ts";
import { NotFoundError } from "@/server/errors/index.ts";
import { CharacterContributors, Characters, type Pagination, Users, Visibility } from "@/server/repositories/index.ts";
import { createActivityWithNotifications } from "@/server/services/activities/index.ts";
import { toPublicUser } from "@/server/services/authentication/index.ts";
import {
  checkNewContributor,
  describeInviteAnswers,
  getInviteNames,
  getOwnInvite,
  readCharacterInvitePolicies,
  saveInviteAnswer,
  withInviteRefusal,
} from "@/server/services/invites/index.ts";
import { CharactersPolicy, isAllowed } from "@/server/services/policies/index.ts";
import { withInviteCharacter, withLockedCharacter } from "@/server/services/writes/index.ts";
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
    characterName: string,
    status: "Active" | "Rejected",
  ) {
    return await saveInviteAnswer(tx, session, CharacterContributors, contributor.id, status, {
      targetType: TARGET_TYPES.characterContributors,
      type: status === "Active" ? "acceptCharacterContributorInvite" : "rejectCharacterContributorInvite",
      data: { contributorId: contributor.id, characterId: contributor.characterId, characterName },
    });
  }

  async acceptInvite(session: Session, contributorId: string) {
    return await withInviteCharacter(
      session,
      contributorId,
      async (tx, policy, character) => {
        const contributor = await getOwnInvite(tx, session, CharacterContributors, contributorId, INVITE_NOT_FOUND);
        policy.canAcceptInvite(contributor);

        return await this.answerInvite(tx, session, contributor, character.name, "Active");
      },
      // The invitee's account, locked shared before the character: it waits for that account's deletion
      { account: { userId: session.userId } },
    );
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

    const policy = await CharactersPolicy.for(db, session, character);
    policy.canReadContributors();

    const paginated = await CharacterContributors.findPage(db, { characterId, ...where }, pagination);
    const ownerUser = await Users.findOne(db, { id: character.userId });
    // Each with whether the session may remove it, as the policy decides
    const items = paginated.items.map((contributor) => ({
      ...contributor,
      canRemove: isAllowed(() => policy.canRevokeContributor({ status: contributor.status })),
    }));
    return { ...paginated, items, owner: ownerUser ? toPublicUser(ownerUser) : null };
  }

  /**
   * The session's invite, whatever its status, so a stale link still says what became of it, and what it may do with
   * it, as the character's policy answers it (`describeInviteAnswers`: whether it may accept it and why not, and still answer it).
   */
  async getInvite(session: Session, contributorId: string) {
    const invite = await CharacterContributors.findOneWithCharacter(db, {
      id: contributorId,
      userId: session.userId,
    });
    if (!invite) throw new NotFoundError(INVITE_NOT_FOUND);

    const policy = (await readCharacterInvitePolicies(db, session, [invite])).get(invite.id);
    return { ...invite, ...describeInviteAnswers(policy, invite) };
  }

  async inviteContributor(session: Session, characterId: string, email: string) {
    const { contributor, emailData } = await withLockedCharacter(
      session,
      characterId,
      async (tx, policy, character) => {
        const user = await Users.findOne(tx, { emailAddress: email });
        policy.canInviteContributors({ invitee: user });

        await checkNewContributor(tx, CharacterContributors, { characterId }, user, email);

        const rows = await withInviteRefusal(() =>
          CharacterContributors.create(tx, {
            characterId,
            email,
            role: "Editor",
            invitedBy: session.userId,
            userId: user?.id,
          }),
        );
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
      // The invitee's account, if the address has one, locked shared before the character: an account's deletion
      // waits for the invite or is seen by it
      { account: { email } },
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
    return await withLockedCharacter(session, characterId, async (tx, policy, character) => {
      policy.canLeave();

      // Its active row, which its policy read under the character's lock
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
    return await withInviteCharacter(session, contributorId, async (tx, policy, character) => {
      const contributor = await getOwnInvite(tx, session, CharacterContributors, contributorId, INVITE_NOT_FOUND);
      policy.canAnswerInvite(contributor);

      return await this.answerInvite(tx, session, contributor, character.name, "Rejected");
    });
  }

  /** Revokes a contributor of the character (`characterId`), or its pending invite: another character's is a 404. */
  async revokeContributor(session: Session, characterId: string, contributorId: string) {
    return await withLockedCharacter(
      session,
      characterId,
      async (tx, policy, character) => {
        const found = await CharacterContributors.findOne(tx, { id: contributorId });
        const contributor = found?.characterId === characterId ? found : undefined;
        // A contributor of a character the session may not read is refused as an unknown one is: the character's
        // existence isn't revealed
        if (!contributor || !policy.isReadable()) throw new NotFoundError("Contributor not found");

        policy.canRevokeContributor({ status: contributor.status });

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
      { notFound: "Contributor not found" },
    );
  }
}

export default new CharacterContributorsService();
