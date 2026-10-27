import { db, withTransaction } from "@/server/database/index.ts";
import { emailService, EmailTemplate } from "@/server/emails/index.ts";
import {
  BadRequestError,
  ConflictError,
  EmailNotVerifiedError,
  InternalError,
  UnauthorizedError,
} from "@/server/errors/index.ts";
import { hashPassword, verifyPassword } from "@/server/password.ts";
import {
  Activities,
  EmailVerifications,
  PasswordResets,
  Sessions,
  Users,
  Visibility,
} from "@/server/repositories/index.ts";
import { TARGET_TYPES } from "@/shared/activityTargets.ts";
import type { Session, User } from "@/shared/relations.ts";

import { openSession, purgeDemoSessionUser, signInAsGoogleAccount, toSafeUser } from "./accounts.ts";
import { createCode, hasRecentCode, verifyCode } from "./codes.ts";
import { verifyGoogleIdToken } from "./google.ts";

const DEMO_TTL_MS = 60 * 60 * 1000;

const DUMMY_HASH = await hashPassword("dummy-password-for-timing-normalization");

class AuthenticationService {
  async forgotPassword(emailAddress: string) {
    const { code } = await withTransaction(async (tx) => {
      const user = await Users.findOne(tx, { emailAddress });
      if (!user) return { code: null };

      // Too soon for another code: answered as an unknown email is, so the answer tells nothing of the account.
      if (await hasRecentCode(tx, PasswordResets, user.id)) return { code: null };

      return { code: await createCode(tx, PasswordResets, user.id) };
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

  async getCurrentUser(session: Session) {
    const user = await Users.findOne(db, { id: session.userId });
    if (!user) throw new InternalError("User not found");

    return toSafeUser(user);
  }

  async resendVerification(emailAddress: string) {
    const { code } = await withTransaction(async (tx) => {
      const user = await Users.findOne(tx, { emailAddress });
      if (!user) return { code: null };

      if (user.emailVerifiedAt) return { code: null };

      // Too soon for another code: answered as an unknown email is, so the answer tells nothing of the account.
      if (await hasRecentCode(tx, EmailVerifications, user.id)) return { code: null };

      return { code: await createCode(tx, EmailVerifications, user.id) };
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

  async resetPassword(emailAddress: string, code: string, newPassword: string) {
    return await withTransaction(async (tx) => {
      const user = await Users.findOne(tx, { emailAddress });
      if (!user) throw new UnauthorizedError("Invalid email or code");

      const reset = await verifyCode(tx, PasswordResets, user.id, code, "Invalid email or code", "Reset code expired");

      const newHash = await hashPassword(newPassword);
      await Users.update(tx, { passwordDigest: newHash }, { id: user.id });
      await PasswordResets.archive(tx, { id: reset.id });
      await Sessions.archive(tx, { userId: user.id });

      await Activities.create(tx, {
        userId: user.id,
        targetId: user.id,
        targetType: TARGET_TYPES.users,
        type: "resetPassword",
      });

      return { success: true };
    });
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

    if (!user.emailVerifiedAt) throw new EmailNotVerifiedError();

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

  async signInWithGoogle(idToken: string, existingSessionId?: string) {
    const payload = await verifyGoogleIdToken(idToken);
    return await signInAsGoogleAccount(payload, existingSessionId);
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
        targetType: TARGET_TYPES.sessions,
        type: "signOut",
      });
    });
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

      // A new user holds no code yet: creating theirs archives none, and none is recent enough to wait on.
      const code = await createCode(tx, EmailVerifications, user.id);

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

  /**
   * The demo of a browser `signedIn` (`findRequestSession`'s answer, null when it's signed out): its own demo session
   * when it's in one, refused when it's a real user's, else a fresh demo user and session. Expired demo users are the
   * runCleanup cron task's to delete.
   */
  async startDemo(signedIn: { session: Session; user: User } | null = null) {
    if (signedIn) {
      if (!signedIn.user.expiresAt) throw new BadRequestError("Already signed in");
      return { session: signedIn.session, user: toSafeUser(signedIn.user), reused: true as const };
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

  async verifyEmail(emailAddress: string, code: string, existingSessionId?: string) {
    return await withTransaction(async (tx) => {
      const user = await Users.findOne(tx, { emailAddress });
      if (!user) throw new UnauthorizedError("Invalid email or code");

      if (user.emailVerifiedAt) throw new BadRequestError("Email already verified");

      const verification = await verifyCode(
        tx,
        EmailVerifications,
        user.id,
        code,
        "Invalid email or code",
        "Verification code expired",
      );

      await Users.update(tx, { emailVerifiedAt: new Date().toISOString() }, { id: user.id });
      await EmailVerifications.archive(tx, { id: verification.id });

      await purgeDemoSessionUser(tx, existingSessionId);

      const session = await openSession(tx, user, "signUp");
      return { session, user: toSafeUser(user) };
    });
  }
}

export default new AuthenticationService();
