import type { InferInsertModel } from "drizzle-orm";

import type { usersInAccount } from "@/drizzle/schema.ts";
import { db, withTransaction } from "@/server/database/index.ts";
import { emailService, EmailTemplate } from "@/server/emails/index.ts";
import { BadRequestError, InternalError, UnauthorizedError } from "@/server/errors/index.ts";
import { hashPassword, verifyPassword } from "@/server/password.ts";
import {
  Activities,
  Campaigns,
  Characters,
  EmailVerifications,
  Invites,
  OauthAccounts,
  PasswordResets,
  Players,
  Rulesets,
  StarredRulesets,
  Users,
} from "@/server/repositories/index.ts";
import { purgeAttachmentsForRecords } from "@/server/services/attachments/index.ts";
import {
  assertNotTaken,
  signOutEverywhere,
  toSafeUser,
  withTakenRefusal,
} from "@/server/services/authentication/accounts.ts";
import { createCode, hasRecentCode, verifyCode } from "@/server/services/authentication/codes.ts";
import { TARGET_TYPES } from "@/shared/activityTargets.ts";
import type { Session, SessionRow } from "@/shared/relations.ts";

class AccountService {
  async cancelEmailChange(session: Session) {
    return await withTransaction(async (tx) => {
      const user = await Users.findOne(tx, { id: session.userId });
      if (!user) throw new InternalError("User not found");

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
    await withTransaction(async (tx) => {
      await Users.update(tx, { onboardingCompletedAt: new Date().toISOString() }, { id: session.userId });
    });
  }

  async deleteAccount(session: Session, password: string | undefined) {
    const userId = session.userId;

    // Password check first — outside the tx so a bad password doesn't
    // roll back an otherwise-clean state.
    const user = await Users.findOne(db, { id: userId });
    if (!user) throw new InternalError("User not found");

    if (user.passwordDigest) {
      if (!password) throw new BadRequestError("Password is required");

      const { verified } = await verifyPassword(password, user.passwordDigest);
      if (!verified) throw new UnauthorizedError("Incorrect password");
    }

    return await withTransaction(async (tx) => {
      // Its own row, then its rulesets, then the campaigns it holds a seat or an invite in, then its characters,
      // masters first, locked as their writes lock them, before anything writes them (an attachment's purge touches
      // its character's row): it waits on their writes (a campaign it creates meanwhile, an invite it accepts), never
      // on one in a cycle
      // A deletion that ran meanwhile leaves it nothing to delete
      if (!(await Users.lock(tx, { id: userId }, "no key update"))) throw new InternalError("User not found");
      await Rulesets.orphan(tx, { userId });
      await Campaigns.lockMany(tx, { userId });
      const characterIds = await Characters.lockMany(tx, { userId });

      // Drop polymorphic attachment rows for the user + their characters so
      // the sweep can reclaim S3 objects. archive() leaves rows in place, so
      // without this the avatar + every portrait leak forever.
      await purgeAttachmentsForRecords(tx, "User", [userId]);
      await purgeAttachmentsForRecords(tx, "Character", characterIds);

      await Characters.archive(tx, { userId });
      await Players.archive(tx, { userId });
      await Invites.archive(tx, { userId });
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
    const { code, pendingEmailAddress } = await withTransaction(async (tx) => {
      const user = await Users.findOne(tx, { id: session.userId });
      if (!user) throw new InternalError("User not found");

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
    return await withTransaction(async (tx) => {
      const user = await Users.findOne(tx, { id: session.userId });
      if (!user) throw new InternalError("User not found");

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
    return await withTransaction(async (tx) => {
      const user = await Users.findOne(tx, { id: session.userId });
      if (!user) throw new InternalError("User not found");

      if (!user.passwordDigest) throw new BadRequestError("Set a password first");

      const { verified } = await verifyPassword(currentPassword, user.passwordDigest);
      if (!verified) throw new UnauthorizedError("Current password is incorrect");

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
    const { safeUser, emailChangeCode, newEmailAddress } = await withTransaction(async (tx) => {
      const user = await Users.findOne(tx, { id: session.userId });
      if (!user) throw new InternalError("User not found");

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
    const safeUser = await withTransaction(async (tx) => {
      const user = await Users.findOne(tx, { id: session.userId });
      if (!user) throw new InternalError("User not found");

      if (!user.pendingEmailAddress) throw new BadRequestError("No pending email change");

      const verification = await verifyCode(
        tx,
        EmailVerifications,
        user.id,
        code,
        "Invalid code",
        "Verification code expired",
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
