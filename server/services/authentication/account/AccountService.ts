import { getTableName, type InferInsertModel } from "drizzle-orm";

import { usersInAccount } from "@/drizzle/schema.ts";
import { db, withTransaction } from "@/server/database/index.ts";
import { emailService, EmailTemplate } from "@/server/emails/index.ts";
import { BadRequestError, InternalError, UnauthorizedError } from "@/server/errors/index.ts";
import { hashPassword, verifyPassword } from "@/server/password.ts";
import {
  Activities,
  Characters,
  EmailVerifications,
  Invites,
  OauthAccounts,
  PasswordResets,
  Players,
  Rulesets,
  Sessions,
  StarredRulesets,
  Users,
} from "@/server/repositories/index.ts";
import { purgeAttachmentsForRecords } from "@/server/services/attachments/index.ts";
import { toSafeUser } from "@/server/services/authentication/accounts.ts";
import { compareInConstantTime, generateVerificationCode } from "@/server/services/authentication/codes.ts";
import type { Session } from "@/shared/relations.ts";

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
        targetTable: getTableName(usersInAccount),
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
      if (!password) {
        throw new BadRequestError("Password is required");
      }
      const { verified } = await verifyPassword(password, user.passwordDigest);
      if (!verified) {
        throw new UnauthorizedError("Incorrect password");
      }
    }

    return await withTransaction(async (tx) => {
      // Drop polymorphic attachment rows for the user + their characters so
      // the sweep can reclaim S3 objects. archive() leaves rows in place, so
      // without this the avatar + every portrait leak forever.
      const characterIds = await Characters.findIds(tx, { userIds: [userId] });
      await purgeAttachmentsForRecords(tx, "User", [userId]);
      await purgeAttachmentsForRecords(tx, "Character", characterIds);

      await Rulesets.orphan(tx, { userId });
      await Characters.archive(tx, { userId });
      await Players.archive(tx, { userId });
      await Invites.archive(tx, { userId });
      await StarredRulesets.archive(tx, { userId });
      await Sessions.archive(tx, { userId });
      await EmailVerifications.archive(tx, { userId });
      await PasswordResets.archive(tx, { userId });
      await OauthAccounts.archive(tx, { userId });

      await Users.archive(tx, { id: userId });

      await Activities.create(tx, {
        userId,
        targetId: userId,
        targetTable: getTableName(usersInAccount),
        type: "deleteAccount",
      });

      return { success: true };
    });
  }

  async resendEmailChange(session: Session) {
    const { code, pendingEmailAddress } = await withTransaction(async (tx) => {
      const user = await Users.findOne(tx, { id: session.userId });
      if (!user) throw new InternalError("User not found");

      if (!user.pendingEmailAddress) {
        throw new BadRequestError("No pending email change");
      }

      const existing = await EmailVerifications.findOne(tx, { userId: user.id });
      if (existing) {
        const elapsed = Date.now() - new Date(existing.createdAt).getTime();
        if (elapsed < 5 * 60 * 1000) {
          throw new BadRequestError("Please wait before requesting a new code");
        }
      }

      await EmailVerifications.archive(tx, { userId: user.id });

      const code = generateVerificationCode();
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
      await EmailVerifications.create(tx, { userId: user.id, code, expiresAt });

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

      if (user.passwordDigest) {
        throw new BadRequestError("Password already set. Use change password instead.");
      }

      const newHash = await hashPassword(newPassword);
      await Users.update(tx, { passwordDigest: newHash }, { id: session.userId });

      await Activities.create(tx, {
        userId: session.userId,
        targetId: session.userId,
        targetTable: getTableName(usersInAccount),
        type: "setPassword",
      });

      return { success: true };
    });
  }

  async updatePassword(session: Session, currentPassword: string, newPassword: string) {
    return await withTransaction(async (tx) => {
      const user = await Users.findOne(tx, { id: session.userId });
      if (!user) throw new InternalError("User not found");

      if (!user.passwordDigest) {
        throw new BadRequestError("Set a password first");
      }

      const { verified } = await verifyPassword(currentPassword, user.passwordDigest);
      if (!verified) {
        throw new UnauthorizedError("Current password is incorrect");
      }

      // Ensure new password is different
      const { verified: sameAsOld } = await verifyPassword(newPassword, user.passwordDigest);
      if (sameAsOld) {
        throw new BadRequestError("New password must be different from current password");
      }

      const newHash = await hashPassword(newPassword);
      const rows = await Users.update(tx, { passwordDigest: newHash }, { id: session.userId });
      const updatedUser = rows[0];
      if (!updatedUser) throw new InternalError("Failed to update password");
      await Sessions.archive(tx, { userId: session.userId, exceptId: session.id });

      await Activities.create(tx, {
        userId: session.userId,
        targetId: session.userId,
        targetTable: getTableName(usersInAccount),
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

      // Check if email is being changed and is already taken
      if (newEmailAddress) {
        const existingUser = await Users.findOne(tx, { emailAddress: newEmailAddress });
        if (existingUser) {
          throw new BadRequestError("Email address already in use");
        }
      }

      // Check if username is being changed and is already taken
      if (username && username !== user.username) {
        const existingUser = await Users.findOne(tx, {
          username,
        });
        if (existingUser) {
          throw new BadRequestError("Username already in use");
        }
      }

      const updateData: Partial<InferInsertModel<typeof usersInAccount>> = {};
      if (newEmailAddress) {
        updateData.pendingEmailAddress = newEmailAddress;
      }
      if (username !== undefined) updateData.username = username;

      const rows = await Users.update(tx, updateData, { id: session.userId });
      const updatedUser = rows[0];
      if (!updatedUser) throw new InternalError("Failed to update profile");

      let emailChangeCode: string | null = null;

      // If email is changing, create verification code
      if (newEmailAddress) {
        await EmailVerifications.archive(tx, { userId: user.id });

        emailChangeCode = generateVerificationCode();
        const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
        await EmailVerifications.create(tx, { userId: user.id, code: emailChangeCode, expiresAt });
      }

      await Activities.create(tx, {
        userId: session.userId,
        targetId: session.userId,
        targetTable: getTableName(usersInAccount),
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

      if (!user.pendingEmailAddress) {
        throw new BadRequestError("No pending email change");
      }

      const verification = await EmailVerifications.findOne(tx, { userId: user.id });
      if (!verification) throw new UnauthorizedError("Invalid code");

      if (!compareInConstantTime(verification.code, code)) {
        throw new UnauthorizedError("Invalid code");
      }

      if (new Date(verification.expiresAt) < new Date()) {
        throw new UnauthorizedError("Verification code expired");
      }

      // Re-check uniqueness — someone else may have claimed this email
      const existingUser = await Users.findOne(tx, { emailAddress: user.pendingEmailAddress });
      if (existingUser) {
        throw new BadRequestError("Email address already in use");
      }

      const rows = await Users.update(
        tx,
        {
          emailAddress: user.pendingEmailAddress,
          pendingEmailAddress: null,
          emailVerifiedAt: new Date().toISOString(),
        },
        { id: user.id },
      );
      const updatedUser = rows[0];
      if (!updatedUser) throw new InternalError("Failed to update email");

      await EmailVerifications.archive(tx, { id: verification.id });

      await Activities.create(tx, {
        userId: user.id,
        targetId: user.id,
        targetTable: getTableName(usersInAccount),
        type: "verifyEmailChange",
      });

      return toSafeUser(updatedUser);
    });

    return safeUser;
  }
}

export default new AccountService();
