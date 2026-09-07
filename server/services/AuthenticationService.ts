import type { InferInsertModel } from "drizzle-orm";
import { getTableName } from "drizzle-orm";
import { timingSafeEqual } from "node:crypto";

import { oauthAccountsInAccount, sessionsInAccount, usersInAccount } from "@/drizzle/schema.ts";
import { type Db, db, withTransaction } from "@/server/database/index.ts";
import { BadRequestError, ConflictError, InternalError, UnauthorizedError } from "@/server/errors/index.ts";
import { Activities, CharacterContributors, Characters, Contributors, EmailVerifications, Invites, OauthAccounts, PasswordResets, Players, Rulesets, Sessions, StarredRulesets, Users } from "@/server/repositories/index.ts";
import { Visibility } from "@/server/repositories/BaseRepository.ts";
import type {
  DeleteAccountJson,
  ForgotPasswordJson,
  GoogleSignInJson,
  ResendVerificationJson,
  ResetPasswordJson,
  SetPasswordJson,
  SignInJson,
  SignUpJson,
  UnlinkOauthJson,
  UpdatePasswordJson,
  UpdateProfileJson,
  VerifyEmailChangeJson,
  VerifyEmailJson,
} from "@/server/routers/authentication/validation.ts";
import { purgeAttachmentsForRecords } from "@/server/services/AttachmentsService.ts";
import { signFeaturebaseJwt } from "@/server/services/featurebaseJwt.ts";
import BaseService from "@/server/services/BaseService.ts";
import type { Session } from "@/shared/relations.ts";
import { hashPassword, verifyPassword } from "@/shared/utils.ts";
import { emailService } from "@/server/emails/EmailService.ts";
import { EmailTemplate } from "@/server/emails/templates.ts";

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

async function verifyGoogleIdToken(idToken: string): Promise<GoogleTokenPayload> {
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

function generateVerificationCode(): string {
  const buffer = new Uint32Array(1);
  crypto.getRandomValues(buffer);
  return (10000000 + (buffer[0] % 90000000)).toString();
}

function timingSafeCompare(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.byteLength !== bufB.byteLength) return false;
  return timingSafeEqual(bufA, bufB);
}

// Conversion cleanup: when a request reaches sign-in / verifyEmail / Google
// while still carrying a demo cookie, hard-delete the demo user the cookie
// points at. CASCADE wipes their fork/character/etc. immediately rather than
// waiting for lazy recycle on the next /api/demo/start.
async function purgeDemoSessionUser(tx: Db, sessionId: string | undefined) {
  if (!sessionId) return;
  const session = await Sessions.findOne(tx, { id: sessionId });
  if (!session) return;
  const user = await Users.findOne(tx, { id: session.userId });
  if (user?.expiresAt) {
    const characterIds = await Characters.findIdsByUserIds(tx, { userIds: [user.id] });
    await purgeAttachmentsForRecords(tx, "User", [user.id]);
    await purgeAttachmentsForRecords(tx, "Character", characterIds);
    await Users.delete(tx, { id: user.id });
  }
}

export const AuthenticationMethods = {
  async signUp(params: SignUpJson) {
    const { user, code } = await withTransaction(async (tx) => {
      if (params.password !== params.passwordConfirmation) {
        throw new BadRequestError("Passwords do not match");
      }

      const { emailAddress, password } = params;

      // Visibility.All: a deleted account keeps its email on the (unique)
      // users_email index, so re-registering with it must 409 here rather than
      // sail past an unarchived-only check and blow up on the constraint.
      const existingUser = await Users.findOne(tx, { emailAddress }, Visibility.All);
      if (existingUser) throw new ConflictError("Email already in use");

      const rows = await Users.create(tx, { emailAddress, password });
      const user = rows[0];
      if (!user) throw new InternalError("Could not create user");

      const code = generateVerificationCode();
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
      await EmailVerifications.create(tx, { userId: user.id, code, expiresAt });

      return { user, code };
    });

    await emailService.send({
      to: params.emailAddress,
      subject: "Verify your email",
      template: EmailTemplate.EmailVerification,
      props: { code },
    });

    return { user };
  },

  async verifyEmail(params: VerifyEmailJson, existingSessionId?: string) {
    return await withTransaction(async (tx) => {
      const user = await Users.findOne(tx, { emailAddress: params.emailAddress });
      if (!user) throw new UnauthorizedError("Invalid email or code");

      if (user.emailVerifiedAt) {
        throw new BadRequestError("Email already verified");
      }

      const verification = await EmailVerifications.findOne(tx, { userId: user.id });
      if (!verification) throw new UnauthorizedError("Invalid email or code");

      if (!timingSafeCompare(verification.code, params.code)) {
        throw new UnauthorizedError("Invalid email or code");
      }

      if (new Date(verification.expiresAt) < new Date()) {
        throw new UnauthorizedError("Verification code expired");
      }

      await Users.update(tx, { emailVerifiedAt: new Date().toISOString() }, { id: user.id });
      await EmailVerifications.archive(tx, { id: verification.id });

      await purgeDemoSessionUser(tx, existingSessionId);

      const sessionRows = await Sessions.create(tx, { userId: user.id });
      const session = sessionRows[0];
      if (!session) throw new InternalError("Could not create session");

      await Activities.create(tx, {
        userId: user.id,
        targetId: session.id,
        targetTable: getTableName(sessionsInAccount),
        type: "signUp",
      });

      await Promise.all([
        Invites.backfillUserId(tx, user.emailAddress, user.id),
        Contributors.backfillUserId(tx, user.emailAddress, user.id),
        CharacterContributors.backfillUserId(tx, user.emailAddress, user.id),
      ]);

      return { session, user };
    });
  },

  async resendVerification(params: ResendVerificationJson) {
    const { code } = await withTransaction(async (tx) => {
      const user = await Users.findOne(tx, { emailAddress: params.emailAddress });
      if (!user) return { code: null };

      if (user.emailVerifiedAt) return { code: null };

      const existing = await EmailVerifications.findOne(tx, { userId: user.id });
      if (existing) {
        const elapsed = Date.now() - new Date(existing.createdAt).getTime();
        if (elapsed < 5 * 60 * 1000) return { code: null };
      }

      await EmailVerifications.archiveAllForUser(tx, { userId: user.id });

      const code = generateVerificationCode();
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
      await EmailVerifications.create(tx, { userId: user.id, code, expiresAt });

      return { code };
    });

    if (code) {
      await emailService.send({
        to: params.emailAddress,
        subject: "Verify your email",
        template: EmailTemplate.EmailVerification,
        props: { code },
      });
    }

    return { success: true };
  },

  async signIn(params: SignInJson, existingSessionId?: string) {
    const user = await Users.findOne(db, { emailAddress: params.emailAddress });
    if (!user) {
      await verifyPassword(params.password, DUMMY_HASH);
      throw new UnauthorizedError("Invalid email or password");
    }

    if (!user.passwordDigest) {
      await verifyPassword(params.password, DUMMY_HASH);
      throw new UnauthorizedError("Invalid email or password");
    }

    const { verified, needsRehash } = await verifyPassword(params.password, user.passwordDigest);
    if (!verified) throw new UnauthorizedError("Invalid email or password");

    if (!user.emailVerifiedAt) {
      throw new UnauthorizedError("Email not verified");
    }

    return await withTransaction(async (tx) => {
      if (needsRehash) {
        const newHash = await hashPassword(params.password);
        await Users.update(tx, { passwordDigest: newHash }, { id: user.id });
      }

      await purgeDemoSessionUser(tx, existingSessionId);

      const rows = await Sessions.create(tx, { userId: user.id });
      const session = rows[0];
      if (!session) throw new InternalError("Could not create session");

      await Activities.create(tx, {
        userId: user.id,
        targetId: session.id,
        targetTable: getTableName(sessionsInAccount),
        type: "signIn",
      });

      // Backfill any pending invites/contributor invites matching this email
      await Promise.all([
        Invites.backfillUserId(tx, user.emailAddress, user.id),
        Contributors.backfillUserId(tx, user.emailAddress, user.id),
        CharacterContributors.backfillUserId(tx, user.emailAddress, user.id),
      ]);

      return { session, user };
    });
  },

  async signOut(session: Session) {
    return await withTransaction(async (tx) => {
      const user = await Users.findOne(tx, { id: session.userId });
      if (user?.expiresAt) {
        const characterIds = await Characters.findIdsByUserIds(tx, { userIds: [user.id] });
        await purgeAttachmentsForRecords(tx, "User", [user.id]);
        await purgeAttachmentsForRecords(tx, "Character", characterIds);
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
  },

  async me(session: Session) {
    const user = await Users.findOne(db, { id: session.userId });
    if (!user) throw new InternalError("User not found");

    // Return user without sensitive information
    const { passwordDigest, ...safeUser } = user;
    return { ...safeUser, hasPassword: !!passwordDigest };
  },

  async featurebaseToken(session: Session) {
    const user = await Users.findOne(db, { id: session.userId });
    if (!user) throw new InternalError("User not found");
    return { jwt: await signFeaturebaseJwt(user) };
  },

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
          const { passwordDigest, ...safeUser } = user;
          return { session, user: { ...safeUser, hasPassword: !!passwordDigest }, reused: true as const };
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

      const { passwordDigest: _passwordDigest, ...safeUser } = user;
      return { session, user: { ...safeUser, hasPassword: false }, reused: false as const };
    });
  },

  async updateProfile(session: Session, params: UpdateProfileJson) {
    const { safeUser, emailChangeCode } = await withTransaction(async (tx) => {
      const user = await Users.findOne(tx, { id: session.userId });
      if (!user) throw new InternalError("User not found");

      const isEmailChange = params.emailAddress && params.emailAddress !== user.emailAddress;

      // Check if email is being changed and is already taken
      if (isEmailChange) {
        const existingUser = await Users.findOne(tx, {
          emailAddress: params.emailAddress!,
        });
        if (existingUser) {
          throw new BadRequestError("Email address already in use");
        }
      }

      // Check if username is being changed and is already taken
      if (params.username && params.username !== user.username) {
        const existingUser = await Users.findOne(tx, {
          username: params.username,
        });
        if (existingUser) {
          throw new BadRequestError("Username already in use");
        }
      }

      const updateData: Partial<InferInsertModel<typeof usersInAccount>> = {};
      if (isEmailChange) {
        updateData.pendingEmailAddress = params.emailAddress!;
      }
      if (params.username !== undefined) updateData.username = params.username;

      const rows = await Users.update(tx, updateData, { id: session.userId });
      const updatedUser = rows[0];
      if (!updatedUser) throw new InternalError("Failed to update profile");

      let emailChangeCode: string | null = null;

      // If email is changing, create verification code
      if (isEmailChange) {
        await EmailVerifications.archiveAllForUser(tx, { userId: user.id });

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

      // Return user without sensitive information
      const { passwordDigest: _passwordDigest, ...safeUser } = updatedUser;
      return { safeUser, emailChangeCode };
    });

    if (emailChangeCode) {
      await emailService.send({
        to: params.emailAddress!,
        subject: "Confirm your new email",
        template: EmailTemplate.EmailChangeVerification,
        props: { code: emailChangeCode },
      });
    }

    return safeUser;
  },

  async forgotPassword(params: ForgotPasswordJson) {
    const { code } = await withTransaction(async (tx) => {
      const user = await Users.findOne(tx, { emailAddress: params.emailAddress });
      if (!user) return { code: null };

      const existing = await PasswordResets.findOne(tx, { userId: user.id });
      if (existing) {
        const elapsed = Date.now() - new Date(existing.createdAt).getTime();
        if (elapsed < 5 * 60 * 1000) return { code: null };
      }

      await PasswordResets.archiveAllForUser(tx, { userId: user.id });

      const code = generateVerificationCode();
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
      await PasswordResets.create(tx, { userId: user.id, code, expiresAt });

      return { code };
    });

    if (code) {
      await emailService.send({
        to: params.emailAddress,
        subject: "Reset your password",
        template: EmailTemplate.PasswordReset,
        props: { code },
      });
    }

    return { success: true };
  },

  async resetPassword(params: ResetPasswordJson) {
    return await withTransaction(async (tx) => {
      const user = await Users.findOne(tx, { emailAddress: params.emailAddress });
      if (!user) throw new UnauthorizedError("Invalid email or code");

      const reset = await PasswordResets.findOne(tx, { userId: user.id });
      if (!reset) throw new UnauthorizedError("Invalid email or code");

      if (!timingSafeCompare(reset.code, params.code)) {
        throw new UnauthorizedError("Invalid email or code");
      }

      if (new Date(reset.expiresAt) < new Date()) {
        throw new UnauthorizedError("Reset code expired");
      }

      const newHash = await hashPassword(params.newPassword);
      await Users.update(tx, { passwordDigest: newHash }, { id: user.id });
      await PasswordResets.archive(tx, { id: reset.id });

      await Activities.create(tx, {
        userId: user.id,
        targetId: user.id,
        targetTable: getTableName(usersInAccount),
        type: "resetPassword",
      });

      return { success: true };
    });
  },

  async verifyEmailChange(session: Session, params: VerifyEmailChangeJson) {
    const safeUser = await withTransaction(async (tx) => {
      const user = await Users.findOne(tx, { id: session.userId });
      if (!user) throw new InternalError("User not found");

      if (!user.pendingEmailAddress) {
        throw new BadRequestError("No pending email change");
      }

      const verification = await EmailVerifications.findOne(tx, { userId: user.id });
      if (!verification) throw new UnauthorizedError("Invalid code");

      if (!timingSafeCompare(verification.code, params.code)) {
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

      const { passwordDigest: _passwordDigest, ...safeUser } = updatedUser;
      return safeUser;
    });

    return safeUser;
  },

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
  },

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
  },

  async updatePassword(session: Session, params: UpdatePasswordJson) {
    return await withTransaction(async (tx) => {
      const user = await Users.findOne(tx, { id: session.userId });
      if (!user) throw new InternalError("User not found");

      if (!user.passwordDigest) {
        throw new BadRequestError("Set a password first");
      }

      // Verify current password
      const { verified } = await verifyPassword(params.currentPassword, user.passwordDigest);
      if (!verified) {
        throw new UnauthorizedError("Current password is incorrect");
      }

      // Ensure new password is different
      const { verified: sameAsOld } = await verifyPassword(params.newPassword, user.passwordDigest);
      if (sameAsOld) {
        throw new BadRequestError("New password must be different from current password");
      }

      // Update password
      const newHash = await hashPassword(params.newPassword);
      const rows = await Users.update(tx, { passwordDigest: newHash }, { id: session.userId });
      const updatedUser = rows[0];
      if (!updatedUser) throw new InternalError("Failed to update password");

      await Activities.create(tx, {
        userId: session.userId,
        targetId: session.userId,
        targetTable: getTableName(usersInAccount),
        type: "updatePassword",
      });

      return { success: true };
    });
  },

  async completeOnboarding(session: Session) {
    await withTransaction(async (tx) => {
      await Users.update(tx, { onboardingCompletedAt: new Date().toISOString() }, { id: session.userId });
    });
  },

  async deleteAccount(session: Session, params: DeleteAccountJson) {
    const userId = session.userId;

    // Password check first — outside the tx so a bad password doesn't
    // roll back an otherwise-clean state.
    const user = await Users.findOne(db, { id: userId });
    if (!user) throw new InternalError("User not found");

    if (user.passwordDigest) {
      if (!params.password) {
        throw new BadRequestError("Password is required");
      }
      const { verified } = await verifyPassword(params.password, user.passwordDigest);
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
  },
  async signInWithGoogle(params: GoogleSignInJson, existingSessionId?: string) {
    const payload = await verifyGoogleIdToken(params.idToken);
    const email = payload.email.toLowerCase();

    return await withTransaction(async (tx) => {
      await purgeDemoSessionUser(tx, existingSessionId);

      // Case 1: Returning Google user
      const existingOauth = await OauthAccounts.findOne(tx, {
        provider: "google",
        providerAccountId: payload.sub,
      });

      if (existingOauth) {
        const user = await Users.findOne(tx, { id: existingOauth.userId });
        if (!user) throw new InternalError("User not found");

        const rows = await Sessions.create(tx, { userId: user.id });
        const session = rows[0];
        if (!session) throw new InternalError("Could not create session");

        await Activities.create(tx, {
          userId: user.id,
          targetId: session.id,
          targetTable: getTableName(sessionsInAccount),
          type: "signIn",
          data: { provider: "google" },
        });

        return { session, user };
      }

      // Case 2: Link existing account (same email). Visibility.All so the
      // email of a deleted account is recognised as taken instead of falling
      // through to Case 3 and hitting the users_email constraint.
      const existingUser = await Users.findOne(tx, { emailAddress: email }, Visibility.All);

      if (existingUser?.deletedAt) {
        throw new ConflictError("Email already in use");
      }

      if (existingUser) {
        await OauthAccounts.create(tx, {
          userId: existingUser.id,
          provider: "google",
          providerAccountId: payload.sub,
        });

        if (!existingUser.emailVerifiedAt) {
          await Users.update(tx, { emailVerifiedAt: new Date().toISOString() }, { id: existingUser.id });
          await EmailVerifications.archiveAllForUser(tx, { userId: existingUser.id });
        }

        const rows = await Sessions.create(tx, { userId: existingUser.id });
        const session = rows[0];
        if (!session) throw new InternalError("Could not create session");

        await Activities.create(tx, {
          userId: existingUser.id,
          targetId: session.id,
          targetTable: getTableName(sessionsInAccount),
          type: "signIn",
          data: { provider: "google" },
        });

        await Promise.all([
          Invites.backfillUserId(tx, existingUser.emailAddress, existingUser.id),
          Contributors.backfillUserId(tx, existingUser.emailAddress, existingUser.id),
          CharacterContributors.backfillUserId(tx, existingUser.emailAddress, existingUser.id),
        ]);

        return { session, user: existingUser };
      }

      // Case 3: New user
      const userRows = await Users.create(tx, { emailAddress: email });
      const user = userRows[0];
      if (!user) throw new InternalError("Could not create user");

      await Users.update(tx, { emailVerifiedAt: new Date().toISOString() }, { id: user.id });

      await OauthAccounts.create(tx, {
        userId: user.id,
        provider: "google",
        providerAccountId: payload.sub,
      });

      const rows = await Sessions.create(tx, { userId: user.id });
      const session = rows[0];
      if (!session) throw new InternalError("Could not create session");

      await Activities.create(tx, {
        userId: user.id,
        targetId: session.id,
        targetTable: getTableName(sessionsInAccount),
        type: "signUp",
        data: { provider: "google" },
      });

      await Promise.all([
        Invites.backfillUserId(tx, user.emailAddress, user.id),
        Contributors.backfillUserId(tx, user.emailAddress, user.id),
        CharacterContributors.backfillUserId(tx, user.emailAddress, user.id),
      ]);

      return { session, user };
    });
  },

  async setPassword(session: Session, params: SetPasswordJson) {
    return await withTransaction(async (tx) => {
      const user = await Users.findOne(tx, { id: session.userId });
      if (!user) throw new InternalError("User not found");

      if (user.passwordDigest) {
        throw new BadRequestError("Password already set. Use change password instead.");
      }

      if (params.newPassword !== params.newPasswordConfirmation) {
        throw new BadRequestError("Passwords do not match");
      }

      const newHash = await hashPassword(params.newPassword);
      await Users.update(tx, { passwordDigest: newHash }, { id: session.userId });

      await Activities.create(tx, {
        userId: session.userId,
        targetId: session.userId,
        targetTable: getTableName(usersInAccount),
        type: "setPassword",
      });

      return { success: true };
    });
  },

  async getLinkedAccounts(session: Session) {
    const accounts = await OauthAccounts.findManyByUser(db, { userId: session.userId });
    return accounts.map((a) => ({ provider: a.provider, linkedAt: a.createdAt }));
  },

  async linkGoogleAccount(session: Session, params: GoogleSignInJson) {
    const payload = await verifyGoogleIdToken(params.idToken);

    return await withTransaction(async (tx) => {
      const existing = await OauthAccounts.findOne(tx, {
        provider: "google",
        providerAccountId: payload.sub,
      });
      if (existing) {
        if (existing.userId === session.userId) {
          throw new BadRequestError("This Google account is already linked to your account");
        }
        throw new BadRequestError("This Google account is already linked to another user");
      }

      await OauthAccounts.create(tx, {
        userId: session.userId,
        provider: "google",
        providerAccountId: payload.sub,
      });

      await Activities.create(tx, {
        userId: session.userId,
        targetId: session.userId,
        targetTable: getTableName(oauthAccountsInAccount),
        type: "linkOauth",
        data: { provider: "google" },
      });

      return { success: true };
    });
  },

  async unlinkOauthAccount(session: Session, params: UnlinkOauthJson) {
    return await withTransaction(async (tx) => {
      const user = await Users.findOne(tx, { id: session.userId });
      if (!user) throw new InternalError("User not found");

      if (!user.passwordDigest) {
        throw new BadRequestError("Cannot unlink OAuth provider without a password set. Set a password first.");
      }

      const oauthAccount = await OauthAccounts.findOne(tx, {
        userId: session.userId,
        provider: params.provider,
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
  },
} as const;

class AuthenticationService extends BaseService<typeof AuthenticationMethods> {
  static initialize() {
    return new AuthenticationService(AuthenticationMethods);
  }
}

export default AuthenticationService;
