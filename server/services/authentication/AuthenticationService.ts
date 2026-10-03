import { timingSafeEqual } from "node:crypto";

import { getTableName, type InferInsertModel } from "drizzle-orm";

import { oauthAccountsInAccount, sessionsInAccount, usersInAccount } from "@/drizzle/schema.ts";
import { db, withTransaction } from "@/server/database/index.ts";
import { emailService } from "@/server/emails/EmailService.ts";
import { EmailTemplate } from "@/server/emails/templates.ts";
import { BadRequestError, ConflictError, InternalError, UnauthorizedError } from "@/server/errors/index.ts";
import { hashPassword, verifyPassword } from "@/server/password.ts";
import { Visibility } from "@/server/repositories/BaseRepository.ts";
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
import type { Session } from "@/shared/relations.ts";

import {
  linkGoogleAccountTo,
  openSession,
  purgeDemoSessionUser,
  signInAsGoogleAccount,
  toSafeUser,
} from "./accounts.ts";

const DUMMY_HASH = await hashPassword("dummy-password-for-timing-normalization");

const DEMO_TTL_MS = 60 * 60 * 1000;

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;

interface GoogleTokenPayload {
  sub: string;
  email: string;
  email_verified: boolean;
  name?: string;
  picture?: string;
  aud: string;
  iss: string;
  exp: number;
}

class AuthenticationService {
  private async verifyGoogleIdToken(idToken: string): Promise<GoogleTokenPayload> {
    const response = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`);
    if (!response.ok) {
      throw new UnauthorizedError("Invalid Google ID token");
    }

    const payload = (await response.json()) as GoogleTokenPayload;

    if (!GOOGLE_CLIENT_ID || payload.aud !== GOOGLE_CLIENT_ID) {
      throw new UnauthorizedError("Invalid Google ID token audience");
    }

    if (payload.iss !== "accounts.google.com" && payload.iss !== "https://accounts.google.com") {
      throw new UnauthorizedError("Invalid Google ID token issuer");
    }

    if (!payload.email_verified) {
      throw new UnauthorizedError("Google email not verified");
    }

    if (payload.exp * 1000 < Date.now()) {
      throw new UnauthorizedError("Google ID token expired");
    }

    return payload;
  }

  private generateVerificationCode(): string {
    const buffer = new Uint32Array(1);
    crypto.getRandomValues(buffer);
    return (10000000 + (buffer[0] % 90000000)).toString();
  }

  private timingSafeCompare(a: string, b: string): boolean {
    const bufA = Buffer.from(a);
    const bufB = Buffer.from(b);
    if (bufA.byteLength !== bufB.byteLength) return false;
    return timingSafeEqual(bufA, bufB);
  }

  async signUp(emailAddress: string, password: string) {
    const { user, code } = await withTransaction(async (tx) => {
      // Visibility.All: a deleted account keeps its email on the (unique)
      // users_email index, so re-registering with it must 409 here rather than
      // sail past an unarchived-only check and blow up on the constraint.
      const existingUser = await Users.findOne(tx, { emailAddress }, Visibility.All);
      if (existingUser) throw new ConflictError("Email already in use");

      const rows = await Users.create(tx, { emailAddress, password });
      const user = rows[0];
      if (!user) throw new InternalError("Could not create user");

      const code = this.generateVerificationCode();
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
      await EmailVerifications.create(tx, { userId: user.id, code, expiresAt });

      return { user, code };
    });

    await emailService.send({
      to: emailAddress,
      subject: "Verify your email",
      template: EmailTemplate.EmailVerification,
      props: { code },
    });

    return { user };
  }

  async verifyEmail(emailAddress: string, code: string, existingSessionId?: string) {
    return await withTransaction(async (tx) => {
      const user = await Users.findOne(tx, { emailAddress });
      if (!user) throw new UnauthorizedError("Invalid email or code");

      if (user.emailVerifiedAt) {
        throw new BadRequestError("Email already verified");
      }

      const verification = await EmailVerifications.findOne(tx, { userId: user.id });
      if (!verification) throw new UnauthorizedError("Invalid email or code");

      if (!this.timingSafeCompare(verification.code, code)) {
        throw new UnauthorizedError("Invalid email or code");
      }

      if (new Date(verification.expiresAt) < new Date()) {
        throw new UnauthorizedError("Verification code expired");
      }

      await Users.update(tx, { emailVerifiedAt: new Date().toISOString() }, { id: user.id });
      await EmailVerifications.archive(tx, { id: verification.id });

      await purgeDemoSessionUser(tx, existingSessionId);

      const session = await openSession(tx, user, "signUp");
      return { session, user: toSafeUser(user) };
    });
  }

  async resendVerification(emailAddress: string) {
    const { code } = await withTransaction(async (tx) => {
      const user = await Users.findOne(tx, { emailAddress });
      if (!user) return { code: null };

      if (user.emailVerifiedAt) return { code: null };

      const existing = await EmailVerifications.findOne(tx, { userId: user.id });
      if (existing) {
        const elapsed = Date.now() - new Date(existing.createdAt).getTime();
        if (elapsed < 5 * 60 * 1000) return { code: null };
      }

      await EmailVerifications.archiveAllForUser(tx, { userId: user.id });

      const code = this.generateVerificationCode();
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
      await EmailVerifications.create(tx, { userId: user.id, code, expiresAt });

      return { code };
    });

    if (code) {
      await emailService.send({
        to: emailAddress,
        subject: "Verify your email",
        template: EmailTemplate.EmailVerification,
        props: { code },
      });
    }

    return { success: true };
  }

  async signIn(emailAddress: string, password: string, existingSessionId?: string) {
    const user = await Users.findOne(db, { emailAddress });
    if (!user) {
      await verifyPassword(password, DUMMY_HASH);
      throw new UnauthorizedError("Invalid email or password");
    }

    if (!user.passwordDigest) {
      await verifyPassword(password, DUMMY_HASH);
      throw new UnauthorizedError("Invalid email or password");
    }

    const { verified, needsRehash } = await verifyPassword(password, user.passwordDigest);
    if (!verified) throw new UnauthorizedError("Invalid email or password");

    if (!user.emailVerifiedAt) {
      throw new UnauthorizedError("Email not verified");
    }

    return await withTransaction(async (tx) => {
      if (needsRehash) {
        const newHash = await hashPassword(password);
        await Users.update(tx, { passwordDigest: newHash }, { id: user.id });
      }

      await purgeDemoSessionUser(tx, existingSessionId);

      const session = await openSession(tx, user, "signIn");
      return { session, user: toSafeUser(user) };
    });
  }

  async signOut(session: Session) {
    return await withTransaction(async (tx) => {
      const user = await Users.findOne(tx, { id: session.userId });
      if (user?.expiresAt) {
        await Users.delete(tx, { id: user.id });
        return;
      }

      const rows = await Sessions.archive(tx, { id: session.id });
      const archivedSession = rows[0];
      if (!archivedSession) throw new InternalError("Session not found");

      await Activities.create(tx, {
        userId: archivedSession.userId,
        targetId: archivedSession.id,
        targetTable: getTableName(sessionsInAccount),
        type: "signOut",
      });
    });
  }

  async me(session: Session) {
    const user = await Users.findOne(db, { id: session.userId });
    if (!user) throw new InternalError("User not found");

    return toSafeUser(user);
  }

  // Returns an existing valid demo session if `existingSessionId` is one;
  // otherwise mints a fresh demo user + session. Cleanup of expired demo
  // users happens out-of-band via the runCleanup cron task.
  async startDemo(existingSessionId?: string) {
    if (existingSessionId) {
      const session = await Sessions.findOne(db, { id: existingSessionId });
      if (session && new Date(session.expiresAt) >= new Date()) {
        const user = await Users.findOne(db, { id: session.userId });
        if (user && !user.expiresAt) {
          throw new BadRequestError("Already signed in");
        }
        if (user?.expiresAt && new Date(user.expiresAt) >= new Date()) {
          return { session, user: toSafeUser(user), reused: true as const };
        }
      }
    }

    return await withTransaction(async (tx) => {
      const expiresAt = new Date(Date.now() + DEMO_TTL_MS).toISOString();
      const emailAddress = `demo-${crypto.randomUUID()}@demo.invalid`;
      const emailVerifiedAt = new Date().toISOString();

      const rows = await Users.create(tx, { emailAddress, expiresAt, emailVerifiedAt });
      const user = rows[0];
      if (!user) throw new InternalError("Could not create demo user");

      const sessionRows = await Sessions.create(tx, { userId: user.id, expiresAt });
      const session = sessionRows[0];
      if (!session) throw new InternalError("Could not create demo session");

      return { session, user: toSafeUser(user), reused: false as const };
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
        await EmailVerifications.archiveAllForUser(tx, { userId: user.id });

        emailChangeCode = this.generateVerificationCode();
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

  async forgotPassword(emailAddress: string) {
    const { code } = await withTransaction(async (tx) => {
      const user = await Users.findOne(tx, { emailAddress });
      if (!user) return { code: null };

      const existing = await PasswordResets.findOne(tx, { userId: user.id });
      if (existing) {
        const elapsed = Date.now() - new Date(existing.createdAt).getTime();
        if (elapsed < 5 * 60 * 1000) return { code: null };
      }

      await PasswordResets.archiveAllForUser(tx, { userId: user.id });

      const code = this.generateVerificationCode();
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
      await PasswordResets.create(tx, { userId: user.id, code, expiresAt });

      return { code };
    });

    if (code) {
      await emailService.send({
        to: emailAddress,
        subject: "Reset your password",
        template: EmailTemplate.PasswordReset,
        props: { code },
      });
    }

    return { success: true };
  }

  async resetPassword(emailAddress: string, code: string, newPassword: string) {
    return await withTransaction(async (tx) => {
      const user = await Users.findOne(tx, { emailAddress });
      if (!user) throw new UnauthorizedError("Invalid email or code");

      const reset = await PasswordResets.findOne(tx, { userId: user.id });
      if (!reset) throw new UnauthorizedError("Invalid email or code");

      if (!this.timingSafeCompare(reset.code, code)) {
        throw new UnauthorizedError("Invalid email or code");
      }

      if (new Date(reset.expiresAt) < new Date()) {
        throw new UnauthorizedError("Reset code expired");
      }

      const newHash = await hashPassword(newPassword);
      await Users.update(tx, { passwordDigest: newHash }, { id: user.id });
      await PasswordResets.archive(tx, { id: reset.id });
      await Sessions.archiveAllForUser(tx, { userId: user.id });

      await Activities.create(tx, {
        userId: user.id,
        targetId: user.id,
        targetTable: getTableName(usersInAccount),
        type: "resetPassword",
      });

      return { success: true };
    });
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

      if (!this.timingSafeCompare(verification.code, code)) {
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

  async cancelEmailChange(session: Session) {
    return await withTransaction(async (tx) => {
      const user = await Users.findOne(tx, { id: session.userId });
      if (!user) throw new InternalError("User not found");

      await Users.update(tx, { pendingEmailAddress: null }, { id: user.id });
      await EmailVerifications.archiveAllForUser(tx, { userId: user.id });

      await Activities.create(tx, {
        userId: user.id,
        targetId: user.id,
        targetTable: getTableName(usersInAccount),
        type: "cancelEmailChange",
      });
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

      await EmailVerifications.archiveAllForUser(tx, { userId: user.id });

      const code = this.generateVerificationCode();
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

  async updatePassword(session: Session, currentPassword: string, newPassword: string) {
    return await withTransaction(async (tx) => {
      const user = await Users.findOne(tx, { id: session.userId });
      if (!user) throw new InternalError("User not found");

      if (!user.passwordDigest) {
        throw new BadRequestError("Set a password first");
      }

      // Verify current password
      const { verified } = await verifyPassword(currentPassword, user.passwordDigest);
      if (!verified) {
        throw new UnauthorizedError("Current password is incorrect");
      }

      // Ensure new password is different
      const { verified: sameAsOld } = await verifyPassword(newPassword, user.passwordDigest);
      if (sameAsOld) {
        throw new BadRequestError("New password must be different from current password");
      }

      // Update password
      const newHash = await hashPassword(newPassword);
      const rows = await Users.update(tx, { passwordDigest: newHash }, { id: session.userId });
      const updatedUser = rows[0];
      if (!updatedUser) throw new InternalError("Failed to update password");
      await Sessions.archiveAllForUser(tx, { userId: session.userId, exceptId: session.id });

      await Activities.create(tx, {
        userId: session.userId,
        targetId: session.userId,
        targetTable: getTableName(usersInAccount),
        type: "updatePassword",
      });

      return { success: true };
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
      const characterIds = await Characters.findIdsByUserIds(tx, { userIds: [userId] });
      await purgeAttachmentsForRecords(tx, "User", [userId]);
      await purgeAttachmentsForRecords(tx, "Character", characterIds);

      await Rulesets.orphanByUser(tx, { userId });
      await Characters.archiveAllForUser(tx, { userId });
      await Players.archiveAllForUser(tx, { userId });
      await Invites.archiveAllForUser(tx, { userId });
      await StarredRulesets.archiveAllForUser(tx, { userId });
      await Sessions.archiveAllForUser(tx, { userId });
      await EmailVerifications.archiveAllForUser(tx, { userId });
      await PasswordResets.archiveAllForUser(tx, { userId });
      await OauthAccounts.archiveAllForUser(tx, { userId });

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

  async signInWithGoogle(idToken: string, existingSessionId?: string) {
    const payload = await this.verifyGoogleIdToken(idToken);
    return await signInAsGoogleAccount(payload, existingSessionId);
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

  async getLinkedAccounts(session: Session) {
    const accounts = await OauthAccounts.findManyByUser(db, { userId: session.userId });
    return accounts.map((a) => ({ provider: a.provider, linkedAt: a.createdAt }));
  }

  async linkGoogleAccount(session: Session, idToken: string) {
    const payload = await this.verifyGoogleIdToken(idToken);
    return await linkGoogleAccountTo(session, payload.sub);
  }

  async unlinkOauthAccount(session: Session, provider: string) {
    return await withTransaction(async (tx) => {
      const user = await Users.findOne(tx, { id: session.userId });
      if (!user) throw new InternalError("User not found");

      if (!user.passwordDigest) {
        throw new BadRequestError("Cannot unlink OAuth provider without a password set. Set a password first.");
      }

      const oauthAccount = await OauthAccounts.findOne(tx, {
        userId: session.userId,
        provider,
      });
      if (!oauthAccount) throw new BadRequestError("OAuth provider not linked");

      await OauthAccounts.archive(tx, { id: oauthAccount.id });

      await Activities.create(tx, {
        userId: session.userId,
        targetId: oauthAccount.id,
        targetTable: getTableName(oauthAccountsInAccount),
        type: "unlinkOauth",
      });

      return { success: true };
    });
  }
}

export default new AuthenticationService();
