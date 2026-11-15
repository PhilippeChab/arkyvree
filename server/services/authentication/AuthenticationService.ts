import { db } from "@/server/database/index.ts";
import { emailService, EmailTemplate } from "@/server/emails/index.ts";
import { BadRequestError, EmailNotVerifiedError, InternalError, UnauthorizedError } from "@/server/errors/index.ts";
import { hashPassword, verifyPassword } from "@/server/password.ts";
import {
  Activities,
  EmailVerifications,
  InstanceSettings,
  PasswordResets,
  Sessions,
  Users,
} from "@/server/repositories/index.ts";
import { withAccountWrite, withNewAccount } from "@/server/services/writes/index.ts";
import { TARGET_TYPES } from "@/shared/activityTargets.ts";
import type { Session, SessionRow } from "@/shared/relations.ts";

import {
  assertNotTaken,
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

      const reset = await verifyCode(tx, PasswordResets, user.id, code, "Invalid email or code", "Reset code expired");

      const newHash = await hashPassword(newPassword);
      await Users.update(tx, { passwordDigest: newHash }, { id: user.id });
      await PasswordResets.archive(tx, { id: reset.id });
      // A reset is how an account is taken back
      await signOutEverywhere(tx, user.id);

      await Activities.create(tx, {
        userId: user.id,
        targetId: user.id,
        targetType: TARGET_TYPES.users,
        type: "resetPassword",
      });

      return { success: true };
    });
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
