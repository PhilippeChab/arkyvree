import { contributorsInCharacter } from "@/drizzle/schema.ts";
import { db, withTransaction } from "@/server/database/index.ts";
import { emailService } from "@/server/emails";
import { EmailTemplate } from "@/server/emails/templates.ts";
import {
  ConflictError,
  NotFoundError,
} from "@/server/errors/index.ts";
import { CharacterContributors, Characters, Notifications, Users } from "@/server/repositories/index.ts";
import { Visibility } from "@/server/repositories/BaseRepository.ts";
import { createActivityWithNotifications } from "@/server/services/activityNotifications.ts";
import BaseService from "@/server/services/BaseService.ts";
import { CharactersPolicy } from "@/server/services/policies/index.ts";
import type { Session } from "@/shared/relations.ts";
import { getTableName } from "drizzle-orm";

export const CharacterContributorsMethods = {
  async getUserContributorInvites(userId: string) {
    return await CharacterContributors.findManyByUserId(
      db,
      { userId, status: "Pending" },
      { limit: 10 },
    );
  },

  // Single invite for the current user, any status. Used by the invite-accept
  // page so a stale link still resolves to "Already accepted" / "no longer
  // pending" copy instead of "Not found".
  async getContributorInvite(session: Session, contributorId: string) {
    const invite = await CharacterContributors.findOneForUser(db, {
      id: contributorId,
      userId: session.userId,
    });
    if (!invite) {
      throw new NotFoundError("Contributor invite not found");
    }
    return invite;
  },

  async getContributors(
    session: Session,
    characterId: string,
    where: {
      search?: string;
      orderBy?: "createdAt" | "updatedAt";
      orderDir?: "asc" | "desc";
    },
    pagination: { limit: number; page: number },
  ) {
    const character = await Characters.findOne(db, { id: characterId }, Visibility.All);
    if (!character || character.kind !== "pc") {
      throw new NotFoundError("Character not found");
    }

    const role = await CharacterContributors.findActiveRole(db, {
      userId: session.userId,
      characterId,
    });
    new CharactersPolicy(session, character, role !== null).canReadContributors();

    const paginated = await CharacterContributors.findMany(db, { characterId, ...where }, pagination);
    const ownerUser = await Users.findOne(db, { id: character.userId });
    const owner = ownerUser
      ? { id: ownerUser.id, username: ownerUser.username, emailAddress: ownerUser.emailAddress }
      : null;
    return { ...paginated, owner };
  },

  async inviteContributor(
    session: Session,
    characterId: string,
    email: string,
  ) {
    const { contributor, emailData } = await withTransaction(async (tx) => {
      const character = await Characters.findOne(tx, { id: characterId }, Visibility.All);
      if (!character || character.kind !== "pc") {
        throw new NotFoundError("Character not found");
      }

      new CharactersPolicy(session, character).canManageContributors();

      if (character.deletedAt) {
        throw new ConflictError("Cannot invite a contributor to an archived character");
      }

      const user = await Users.findOne(tx, { emailAddress: email });

      if (user && user.id === character.userId) {
        throw new ConflictError(
          "Cannot invite the character owner as a contributor",
        );
      }

      if (user) {
        const existing = await CharacterContributors.findOne(tx, {
          characterId,
          userId: user.id,
          status: "Active",
        });
        if (existing) {
          throw new ConflictError("User is already a contributor");
        }
        const pending = await CharacterContributors.findOne(tx, {
          characterId,
          userId: user.id,
          status: "Pending",
        });
        if (pending) {
          throw new ConflictError("User already has a pending invite");
        }
      } else {
        const pending = await CharacterContributors.findOne(tx, {
          characterId,
          email,
          status: "Pending",
        });
        if (pending) {
          throw new ConflictError("This email already has a pending invite");
        }
      }

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
        targetTable: getTableName(contributorsInCharacter),
        type: "inviteCharacterContributor",
        data: { email, characterId, characterName: character.name },
      });

      const inviterUser = await Users.findOne(tx, { id: session.userId });

      return {
        contributor,
        emailData: {
          email,
          inviteeName: user?.username || email.split("@")[0],
          inviterName:
            inviterUser?.username ||
            inviterUser?.emailAddress.split("@")[0] ||
            "Someone",
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
  },

  async acceptContributorInvite(session: Session, contributorId: string) {
    return await withTransaction(async (tx) => {
      const contributor = await CharacterContributors.findOne(tx, { id: contributorId });
      if (!contributor) {
        throw new NotFoundError("Contributor invite not found");
      }

      if (contributor.userId !== session.userId) {
        throw new NotFoundError("Contributor invite not found");
      }

      if (contributor.status !== "Pending") {
        throw new ConflictError("Invite is no longer pending");
      }

      const character = await Characters.findOne(tx, { id: contributor.characterId }, Visibility.All);
      if (!character) {
        throw new NotFoundError("Character not found");
      }
      if (character.deletedAt) {
        throw new ConflictError("This character has been archived and can no longer be edited");
      }

      const rows = await CharacterContributors.update(
        tx,
        { status: "Active" },
        { id: contributorId },
      );
      const updated = rows[0];

      await Notifications.markReadByTarget(tx, { recipientId: session.userId, targetId: contributorId });

      await createActivityWithNotifications(tx, {
        userId: session.userId,
        targetId: updated.id,
        targetTable: getTableName(contributorsInCharacter),
        type: "acceptCharacterContributorInvite",
        data: { contributorId, characterId: contributor.characterId, characterName: character.name },
      });

      return updated;
    });
  },

  async rejectContributorInvite(session: Session, contributorId: string) {
    return await withTransaction(async (tx) => {
      const contributor = await CharacterContributors.findOne(tx, { id: contributorId });
      if (!contributor) {
        throw new NotFoundError("Contributor invite not found");
      }

      if (contributor.userId !== session.userId) {
        throw new NotFoundError("Contributor invite not found");
      }

      if (contributor.status !== "Pending") {
        throw new ConflictError("Invite is no longer pending");
      }

      const character = await Characters.findOne(tx, { id: contributor.characterId }, Visibility.All);

      const rows = await CharacterContributors.update(
        tx,
        { status: "Rejected" },
        { id: contributorId },
      );
      const updated = rows[0];

      await Notifications.markReadByTarget(tx, { recipientId: session.userId, targetId: contributorId });

      await createActivityWithNotifications(tx, {
        userId: session.userId,
        targetId: updated.id,
        targetTable: getTableName(contributorsInCharacter),
        type: "rejectCharacterContributorInvite",
        data: { contributorId, characterId: contributor.characterId, characterName: character?.name },
      });

      return updated;
    });
  },

  async revokeContributor(session: Session, contributorId: string) {
    return await withTransaction(async (tx) => {
      const contributor = await CharacterContributors.findOne(tx, { id: contributorId });
      if (!contributor) {
        throw new NotFoundError("Contributor not found");
      }

      const character = await Characters.findOne(tx, { id: contributor.characterId }, Visibility.All);
      if (!character) {
        throw new NotFoundError("Character not found");
      }

      new CharactersPolicy(session, character).canManageContributors();

      if (contributor.status !== "Active" && contributor.status !== "Pending") {
        throw new ConflictError("Contributor is not active or pending");
      }

      const prevStatus = contributor.status;
      const rows = await CharacterContributors.update(
        tx,
        { status: "Revoked" },
        { id: contributorId },
      );
      const updated = rows[0];

      await createActivityWithNotifications(tx, {
        userId: session.userId,
        targetId: updated.id,
        targetTable: getTableName(contributorsInCharacter),
        type: "revokeCharacterContributor",
        data: { contributorId, prevStatus, characterId: contributor.characterId, characterName: character.name },
      });

      return updated;
    });
  },

  async leaveCharacter(session: Session, characterId: string) {
    return await withTransaction(async (tx) => {
      const character = await Characters.findOne(tx, { id: characterId }, Visibility.All);
      if (!character || character.kind !== "pc") {
        throw new NotFoundError("Character not found");
      }

      const contributor = await CharacterContributors.findOne(tx, {
        characterId,
        userId: session.userId,
        status: "Active",
      });
      if (!contributor) {
        throw new NotFoundError("You are not a contributor of this character");
      }

      const rows = await CharacterContributors.update(
        tx,
        { status: "Revoked" },
        { id: contributor.id },
      );
      const updated = rows[0];

      await createActivityWithNotifications(tx, {
        userId: session.userId,
        targetId: updated.id,
        targetTable: getTableName(contributorsInCharacter),
        type: "leaveCharacter",
        data: { characterId, characterName: character.name },
      });

      return updated;
    });
  },

} as const;

class CharacterContributorsService extends BaseService<typeof CharacterContributorsMethods> {
  static initialize() {
    return new CharacterContributorsService(CharacterContributorsMethods);
  }
}

export default CharacterContributorsService;
