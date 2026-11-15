import type { Db } from "@/drizzle/database.ts";
import { db } from "@/server/database/index.ts";
import { emailService, EmailTemplate } from "@/server/emails/index.ts";
import {
  BadRequestError,
  EmailNotVerifiedError,
  ForbiddenError,
  InternalError,
  UnauthorizedError,
} from "@/server/errors/index.ts";
import { hashLinkToken } from "@/server/linkTokens.ts";
import { hashPassword, verifyPassword } from "@/server/password.ts";
import {
  Activities,
  EmailVerifications,
  InstanceSettings,
  PasswordResetLinks,
  PasswordResets,
  Sessions,
  Users,
} from "@/server/repositories/index.ts";
import { withAccountFoundBy, withAccountWrite, withNewAccount } from "@/server/services/writes/index.ts";
import { TARGET_TYPES } from "@/shared/activityTargets.ts";
import { describePasswordResetLinkState, PASSWORD_RESET_LINK_MESSAGES } from "@/shared/passwordResetLinks.ts";
import type { Session, SessionRow } from "@/shared/relations.ts";

import {
  assertNotTaken,
  DEACTIVATED_MESSAGE,
  openSession,
  signInAsGoogleAccount,
  signOutEverywhere,
  toSafeUser,
  withAccountByAddress,
  withTakenRefusal,
} from "./accounts.ts";
import { createCode, hasRecentCode, verifyCode } from "./codes.ts";
import { verifyGoogleIdToken } from "./google.ts";
import { checkSignUp, markAdminIfNone, readInviteLink } from "./signUps.ts";

const DUMMY_HASH = await hashPassword("dummy-password-for-timing-normalization");

/**
 * Sets an account's new password (`userId`), as a reset does, by a code or an admin's link: the codes it was sent end,
 * and it's signed out everywhere (the links made for it with it), as a reset is how an account is taken back. Its activity
 * names the admin who made the link it came through (`resetLinkCreatedBy`), if it came through one.
 */
async function writeResetPassword(tx: Db, userId: string, newPassword: string, resetLinkCreatedBy?: string) {
  await Users.update(tx, { passwordDigest: await hashPassword(newPassword) }, { id: userId });
  await PasswordResets.archive(tx, { userId });
  await signOutEverywhere(tx, userId);
  await Activities.create(tx, {
    userId,
    targetId: userId,
    targetType: TARGET_TYPES.users,
    type: "resetPassword",
    data: resetLinkCreatedBy ? { resetLinkCreatedBy } : undefined,
  });
}

class AuthenticationService {
  async forgotPassword(emailAddress: string) {
    const { code } = await withAccountByAddress(emailAddress, async (tx, user) => {
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

  /**
   * What an invite link's token reads as, to whoever opens its link: one that lets them sign up, or why it doesn't
   * (expired, revoked, or naming no link). Nothing else of the link.
   */
  async getInviteLinkState(token: string) {
    const { state } = await readInviteLink(db, token);
    return { state };
  }

  /**
   * What a password reset link's token reads as, to whoever opens its link: one that resets its account's password, or
   * why it doesn't (expired, used, or naming no link). Nothing else of the link, nor of its account.
   */
  async getPasswordResetLinkState(token: string) {
    const link = await PasswordResetLinks.findOne(db, { digest: hashLinkToken(token) });
    return { state: describePasswordResetLinkState(link) };
  }

  /**
   * Who may make an account on the instance, as its signed-out pages show it: its setting, and whether it has an admin
   * yet (without one, anyone may: the first account becomes its admin).
   */
  async getSignUpPolicy() {
    const settings = await InstanceSettings.findOne(db);
    if (!settings) throw new InternalError("The instance's settings are missing");
    return { hasAdmin: (await Users.count(db, { isAdmin: true })) > 0, signUpPolicy: settings.signUpPolicy };
  }

  async resendVerification(emailAddress: string) {
    const { code } = await withAccountByAddress(emailAddress, async (tx, user) => {
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
    return await withAccountByAddress(emailAddress, async (tx, user) => {
      if (!user) throw new UnauthorizedError("Invalid email or code");

      await verifyCode(tx, PasswordResets, user.id, code, "Invalid email or code", "Reset code expired");
      await writeResetPassword(tx, user.id, newPassword);
      return { success: true };
    });
  }

  /**
   * Resets a password through an admin's link (`token`), once, within its hour: its account's row locked first, then the
   * link read again, so two resets through one link take turns and the second is refused. A deactivated account's is
   * refused; a reset signs its account out everywhere (`writeResetPassword`).
   */
  async resetPasswordWithLink(token: string, newPassword: string) {
    const digest = hashLinkToken(token);
    return await withAccountFoundBy(
      async (tx) => (await PasswordResetLinks.findOne(tx, { digest }))?.userId,
      async (tx, user) => {
        const link = await PasswordResetLinks.findOne(tx, { digest });
        if (!link || !user || user.deletedAt) throw new ForbiddenError(PASSWORD_RESET_LINK_MESSAGES.Unknown);
        const state = describePasswordResetLinkState(link);
        if (state !== "Valid") throw new ForbiddenError(PASSWORD_RESET_LINK_MESSAGES[state]);
        if (user.deactivatedAt) throw new ForbiddenError(DEACTIVATED_MESSAGE);

        await PasswordResetLinks.update(tx, { usedAt: new Date().toISOString() }, { id: link.id });
        await writeResetPassword(tx, user.id, newPassword, link.createdBy);
        return { success: true };
      },
    );
  }

  async signIn(emailAddress: string, password: string) {
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

    // Its account as it stands under its lock: an address or a password changed since it was checked refuses it
    return await withAccountByAddress(emailAddress, async (tx, current) => {
      if (current?.id !== user.id || current.passwordDigest !== user.passwordDigest)
        throw new UnauthorizedError("Invalid email or password");

      if (needsRehash) {
        const newHash = await hashPassword(password);
        await Users.update(tx, { passwordDigest: newHash }, { id: user.id });
      }

      const session = await openSession(tx, current, "signIn");
      return { session, user: toSafeUser(current) };
    });
  }

  /** Signs in with a Google account, or makes its account, through the invite link it came with (`inviteToken`). */
  async signInWithGoogle(idToken: string, inviteToken?: string) {
    const payload = await verifyGoogleIdToken(idToken);
    return await signInAsGoogleAccount(payload, inviteToken);
  }

  async signOut(session: SessionRow) {
    return await withAccountWrite(session.userId, async (tx) => {
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

  /** Makes an account, through the invite link it came with (`inviteToken`), if any, and sends its email's code. */
  async signUp(emailAddress: string, password: string, inviteToken?: string) {
    const { user, code } = await withNewAccount(async (tx) => {
      // Never an admin yet: it becomes one once its email is verified, if the instance has none by then
      const { inviteLinkId } = await checkSignUp(tx, emailAddress, inviteToken);
      await assertNotTaken(tx, { emailAddress });

      const rows = await withTakenRefusal(() => Users.create(tx, { emailAddress, inviteLinkId, password }));
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

  async verifyEmail(emailAddress: string, code: string) {
    return await withAccountByAddress(emailAddress, async (tx, user) => {
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

      const [verified] = await Users.update(tx, { emailVerifiedAt: new Date().toISOString() }, { id: user.id });
      await EmailVerifications.archive(tx, { id: verification.id });
      const account = (await markAdminIfNone(tx, user.id)) ?? verified;

      const session = await openSession(tx, account, "signUp");
      return { session, user: toSafeUser(account) };
    });
  }
}

export default new AuthenticationService();
