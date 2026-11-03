import type { InferInsertModel } from "drizzle-orm";

import type { Db } from "@/drizzle/database.ts";
import type { usersInAccount } from "@/drizzle/schema.ts";
import { db } from "@/server/database/index.ts";
import { emailService, EmailTemplate } from "@/server/emails/index.ts";
import { BadRequestError, InternalError, UnauthorizedError, UnprocessableEntityError } from "@/server/errors/index.ts";
import { hashPassword, verifyPassword } from "@/server/password.ts";
import {
  Activities,
  Campaigns,
  CharacterContributors,
  Characters,
  Contributors,
  EmailVerifications,
  Invites,
  Notifications,
  OauthAccounts,
  PasswordResets,
  PlayerCharacters,
  Players,
  Rulesets,
  StarredRulesets,
  toDeletedAddress,
  Users,
  Visibility,
} from "@/server/repositories/index.ts";
import { createActivityWithNotifications } from "@/server/services/activities/index.ts";
import { purgeAttachmentsForRecords } from "@/server/services/attachments/index.ts";
import {
  assertNotTaken,
  signOutEverywhere,
  toSafeUser,
  withSignedInRefusal,
  withTakenRefusal,
} from "@/server/services/authentication/accounts.ts";
import { createCode, hasRecentCode, verifyCode } from "@/server/services/authentication/codes.ts";
import { withAccountDeletion, withAccountWrite } from "@/server/services/writes/index.ts";
import { TARGET_TYPES } from "@/shared/activityTargets.ts";
import type { ContributorStatus } from "@/shared/enums.ts";
import type { Player, Session, SessionRow, User } from "@/shared/relations.ts";

/** A seat a campaign can be left to, as `Players.findHeirs` reads it. */
type SeatedPlayer = Awaited<ReturnType<typeof Players.findHeirs>>[number];

class AccountService {
  /**
   * Ends what an account being deleted contributes (as read under its lock), in both tables: what's live of it and the
   * invites its address has that no sign-in claimed are revoked, and none of them, nor any row of its user whatever its
   * status, keeps the address. A row keeps its `userId`, which is no one else's.
   */
  private async endContributions(tx: Db, { emailAddress, id: userId }: User) {
    const email = toDeletedAddress(userId);
    for (const contributions of [Contributors, CharacterContributors]) {
      await contributions.update(tx, { email, status: "Revoked" }, { email: emailAddress, userId });
      await contributions.update(tx, { email }, { userId });
    }
  }

  /**
   * Leaves each campaign an account being deleted (`userId`) holds a live seat in to who stays, while its seats are live:
   * a campaign hides what sits on an archived seat.
   *
   * Who it leaves a campaign or a character to needs no lock, which couldn't come this late anyway (users lock before
   * campaigns: `Locks`). This deletion holds the campaign's row, which every write of a seat takes first, so their seat
   * stands until it commits. Their own account's deletion takes that row too, before it locks its characters: one that
   * went first archived their seat, which `Players.findHeirs` doesn't read, and one that waits here finds what this
   * hands them as its own, when its character lock and its reads run, and hands it on in turn.
   */
  private async handOnCampaigns(tx: Db, userId: string) {
    for (const seat of await Players.findMany(tx, { userId })) {
      const master = await this.settleGameMaster(tx, userId, seat);
      if (master) await this.handOnCharacters(tx, seat, master);
    }
  }

  /**
   * Gives what a seat of an account being deleted holds in a campaign that isn't archived to its Game Master (`master`):
   * each character with its bonded creatures, its notes and its portrait, live, its link on their seat with its
   * visibility. Its other contributors keep their access. Its share link ends: it was the deleted account's to give, and
   * its new owner can make another.
   */
  private async handOnCharacters(tx: Db, seat: Player, { id: playerId, userId }: SeatedPlayer) {
    const characterIds = await PlayerCharacters.findCharacterIds(tx, { campaignArchived: false, playerId: seat.id });
    const owner = characterIds.length > 0 ? await Users.findOne(tx, { id: userId }) : undefined;
    for (const characterId of characterIds) {
      await PlayerCharacters.update(tx, { playerId }, { characterId, playerId: seat.id });
      await Characters.update(tx, { shareToken: null, userId }, { id: characterId });
      await Characters.update(tx, { userId }, { parentCharacterId: characterId });
      // An owner isn't a contributor of their own character: nor invited to be one, at an address no sign-in claimed
      const statuses: ContributorStatus[] = ["Pending", "Active"];
      await CharacterContributors.update(tx, { status: "Revoked" }, { characterId, statuses, userId });
      if (owner) {
        const email = owner.emailAddress;
        await CharacterContributors.update(
          tx,
          { status: "Revoked" },
          { characterId, email, statuses: ["Pending"], userId: null },
        );
      }
    }
  }

  /** Makes a seat (`heir`) its campaign's Game Master, as an account's deletion (`userId`) leaves it, and tells them. */
  private async promoteHeir(tx: Db, userId: string, campaignId: string, heir: SeatedPlayer) {
    await Players.update(tx, { role: "Game Master" }, { id: heir.id });
    const campaign = await Campaigns.findOne(tx, { id: campaignId }, Visibility.All);
    await createActivityWithNotifications(tx, {
      userId,
      targetId: campaignId,
      targetType: TARGET_TYPES.campaigns,
      type: "promoteCampaignPlayer",
      data: { campaignName: campaign?.name, promotedUserId: heir.userId },
    });
  }

  /**
   * The Game Master left in a seat's campaign once its account (`userId`), being deleted, goes: the longest-seated one
   * of the others. A campaign with none, whatever the seat's role, passes to its longest-seated other player, archived
   * campaign or not, so someone can run, restore or delete it; with nobody else seated, the campaign is archived, and
   * answers none.
   */
  private async settleGameMaster(tx: Db, userId: string, { campaignId }: Player) {
    const others = await Players.findHeirs(tx, { campaignId, otherThanUserId: userId });
    const master = others.find((player) => player.role === "Game Master");
    if (master) return master;

    const heir = others.at(0);
    if (heir) await this.promoteHeir(tx, userId, campaignId, heir);
    else await Campaigns.archive(tx, { id: campaignId });
    return heir;
  }

  async cancelEmailChange(session: Session) {
    return await withAccountWrite(session.userId, async (tx, user) => {
      await Users.update(tx, { pendingEmailAddress: null }, { id: user.id });
      await EmailVerifications.archive(tx, { userId: user.id });

      await Activities.create(tx, {
        userId: user.id,
        targetId: user.id,
        targetType: TARGET_TYPES.users,
        type: "cancelEmailChange",
      });
    });
  }

  async completeOnboarding(session: Session) {
    await withAccountWrite(session.userId, async (tx) => {
      await Users.update(tx, { onboardingCompletedAt: new Date().toISOString() }, { id: session.userId });
    });
  }

  async deleteAccount(session: Session, password: string | undefined) {
    const userId = session.userId;

    // Password check first — outside the tx so a bad password doesn't
    // roll back an otherwise-clean state.
    // Gone already (another tab's deletion committed since its session was read): refused as its session is
    const user = await Users.findOne(db, { id: userId });
    if (!user) throw new UnauthorizedError("Invalid session");

    if (user.passwordDigest) {
      if (!password) throw new BadRequestError("Password is required");

      const { verified } = await verifyPassword(password, user.passwordDigest);
      // Not a 401, which tells the client its session is gone: `withSignedInRefusal`'s reason
      if (!verified) throw new UnprocessableEntityError("Incorrect password");
    }

    // Everything it owns locked first (its row, its rulesets, the campaigns it holds a seat or an invite in, its
    // characters, masters first), before anything writes them
    return await withAccountDeletion([userId], async (tx) => {
      // A deletion that ran meanwhile (another tab's) leaves it nothing to delete: its session went with it
      const account = await Users.findOne(tx, { id: userId });
      if (!account) throw new UnauthorizedError("Invalid session");
      await Rulesets.orphan(tx, { userId });

      // Drop the avatar's attachment row so the sweep can reclaim its S3 object: archiving the user leaves it in place,
      // so without this it leaks forever.
      await purgeAttachmentsForRecords(tx, "User", [userId]);

      await this.handOnCampaigns(tx, userId);
      // What wasn't handed on goes for good: its bonded creatures, contributors and links by cascade, and the database
      // deletes attachments and modifiers (`Archives`'s `hardDeleteCharacter`)
      await Characters.delete(tx, { userId });
      await Players.archive(tx, { userId });

      // Its address is free once it's archived, last, and whoever takes it next is someone else: what was sent to this
      // person mustn't pass to them. So what finds a row by the address runs first, by the address read under the lock
      await Invites.archive(tx, { email: account.emailAddress, userId });
      await this.endContributions(tx, account);
      await Notifications.updateWithoutActorName(tx, { actorId: userId });

      await StarredRulesets.archive(tx, { userId });
      await signOutEverywhere(tx, userId);
      await EmailVerifications.archive(tx, { userId });
      await PasswordResets.archive(tx, { userId });
      await OauthAccounts.archive(tx, { userId });

      await Users.archive(tx, { id: userId });

      await Activities.create(tx, {
        userId,
        targetId: userId,
        targetType: TARGET_TYPES.users,
        type: "deleteAccount",
      });

      return { success: true };
    });
  }

  async resendEmailChange(session: Session) {
    const { code, pendingEmailAddress } = await withAccountWrite(session.userId, async (tx, user) => {
      if (!user.pendingEmailAddress) throw new BadRequestError("No pending email change");

      // Too soon for another code: a signed-in user is told so, as their account is no secret to them (a signed-out
      // resend answers as an unknown email does).
      if (await hasRecentCode(tx, EmailVerifications, user.id))
        throw new BadRequestError("Please wait before requesting a new code");

      const code = await createCode(tx, EmailVerifications, user.id);
      return { code, pendingEmailAddress: user.pendingEmailAddress };
    });

    await emailService.send({
      to: pendingEmailAddress,
      subject: "Confirm your new email",
      template: EmailTemplate.EmailChangeVerification,
      props: { code },
    });

    return { success: true };
  }

  async setPassword(session: Session, newPassword: string) {
    return await withAccountWrite(session.userId, async (tx, user) => {
      if (user.passwordDigest) throw new BadRequestError("Password already set: change it instead");

      const newHash = await hashPassword(newPassword);
      await Users.update(tx, { passwordDigest: newHash }, { id: session.userId });

      await Activities.create(tx, {
        userId: session.userId,
        targetId: session.userId,
        targetType: TARGET_TYPES.users,
        type: "setPassword",
      });

      return { success: true };
    });
  }

  async updatePassword(session: SessionRow, currentPassword: string, newPassword: string) {
    return await withAccountWrite(session.userId, async (tx, user) => {
      if (!user.passwordDigest) throw new BadRequestError("Set a password first");

      const { verified } = await verifyPassword(currentPassword, user.passwordDigest);
      if (!verified) throw new UnprocessableEntityError("Current password is incorrect");

      // Ensure new password is different
      const { verified: sameAsOld } = await verifyPassword(newPassword, user.passwordDigest);
      if (sameAsOld) throw new BadRequestError("New password must be different from current password");

      const newHash = await hashPassword(newPassword);
      const rows = await Users.update(tx, { passwordDigest: newHash }, { id: session.userId });
      const updatedUser = rows[0];
      if (!updatedUser) throw new InternalError("Failed to update password");
      // Whatever had the old password is cut off: but the session changing it
      await signOutEverywhere(tx, session.userId, session.id);

      await Activities.create(tx, {
        userId: session.userId,
        targetId: session.userId,
        targetType: TARGET_TYPES.users,
        type: "updatePassword",
      });

      return { success: true };
    });
  }

  async updateProfile(session: Session, username: string | undefined, emailAddress: string | undefined) {
    const { safeUser, emailChangeCode, newEmailAddress } = await withAccountWrite(session.userId, async (tx, user) => {
      const newEmailAddress = emailAddress && emailAddress !== user.emailAddress ? emailAddress : undefined;

      if (newEmailAddress) await assertNotTaken(tx, { emailAddress: newEmailAddress });
      if (username && username !== user.username) await assertNotTaken(tx, { username });

      const updateData: Partial<InferInsertModel<typeof usersInAccount>> = {};
      if (newEmailAddress) updateData.pendingEmailAddress = newEmailAddress;

      if (username !== undefined) updateData.username = username;

      const rows = await withTakenRefusal(() => Users.update(tx, updateData, { id: session.userId }));
      const updatedUser = rows[0];
      if (!updatedUser) throw new InternalError("Failed to update profile");

      // A new email takes a code of its own, however soon after the last one: that one was for another address.
      const emailChangeCode = newEmailAddress ? await createCode(tx, EmailVerifications, user.id) : null;

      await Activities.create(tx, {
        userId: session.userId,
        targetId: session.userId,
        targetType: TARGET_TYPES.users,
        type: "updateProfile",
      });

      return { safeUser: toSafeUser(updatedUser), emailChangeCode, newEmailAddress };
    });

    if (emailChangeCode && newEmailAddress) {
      await emailService.send({
        to: newEmailAddress,
        subject: "Confirm your new email",
        template: EmailTemplate.EmailChangeVerification,
        props: { code: emailChangeCode },
      });
    }

    return safeUser;
  }

  async verifyEmailChange(session: Session, code: string) {
    const safeUser = await withAccountWrite(session.userId, async (tx, user) => {
      if (!user.pendingEmailAddress) throw new BadRequestError("No pending email change");

      const verification = await withSignedInRefusal(() =>
        verifyCode(tx, EmailVerifications, user.id, code, "Invalid code", "Verification code expired"),
      );

      // Re-check uniqueness — someone else may have claimed this email
      await assertNotTaken(tx, { emailAddress: user.pendingEmailAddress });

      const { pendingEmailAddress } = user;
      const rows = await withTakenRefusal(() =>
        Users.update(
          tx,
          { emailAddress: pendingEmailAddress, pendingEmailAddress: null, emailVerifiedAt: new Date().toISOString() },
          { id: user.id },
        ),
      );
      const updatedUser = rows[0];
      if (!updatedUser) throw new InternalError("Failed to update email");

      await EmailVerifications.archive(tx, { id: verification.id });

      await Activities.create(tx, {
        userId: user.id,
        targetId: user.id,
        targetType: TARGET_TYPES.users,
        type: "verifyEmailChange",
      });

      return toSafeUser(updatedUser);
    });

    return safeUser;
  }
}

export default new AccountService();
