import { describe, expect, test } from "bun:test";

import { eq } from "drizzle-orm";

import { emailVerificationsInAccount, passwordResetsInAccount } from "@/drizzle/schema.ts";
import { db } from "@/server/database/index.ts";
import { BadRequestError, ConflictError, InternalError, UnauthorizedError } from "@/server/errors/index.ts";
import { Visibility } from "@/server/repositories/BaseRepository.ts";
import {
  Characters,
  EmailVerifications,
  Invites,
  OauthAccounts,
  PasswordResets,
  Players,
  Rulesets,
  Sessions,
  Users,
} from "@/server/repositories/index.ts";
import { AccountService } from "@/server/services/authentication/account/index.ts";
import { signInAsGoogleAccount } from "@/server/services/authentication/index.ts";
import { AuthenticationService } from "@/server/services/authentication/index.ts";
import { LinkedAccountsService, linkGoogleAccountTo } from "@/server/services/authentication/linkedAccounts/index.ts";
import type { Session } from "@/shared/relations.ts";
import {
  createTestCampaign,
  createTestCharacter,
  createTestRuleset,
  createTestUser,
  inviteToSlot,
  makeSession,
  NIL_UUID,
  uniqueId,
} from "@/tests/helpers.ts";

function credentials() {
  const suffix = uniqueId();
  return {
    emailAddress: `test-${suffix}@example.com`,
    password: `password-${suffix}`,
  };
}

async function codeFor(userId: string) {
  return (await EmailVerifications.findOne(db, { userId }))!.code;
}

/** A new verified user, signed in. */
async function signUpAndVerify(account = credentials()) {
  const { user } = await AuthenticationService.signUp(account.emailAddress, account.password);
  await Users.update(db, { emailVerifiedAt: new Date().toISOString() }, { id: user.id });
  const signedIn = await AuthenticationService.signIn(account.emailAddress, account.password);
  return { ...signedIn, account };
}

const missingSession: Session = {
  id: NIL_UUID,
  userId: NIL_UUID,
  createdAt: "",
  updatedAt: "",
  deletedAt: null,
  expiresAt: "",
};
const ago = (ms: number) => new Date(Date.now() - ms).toISOString();

/** A user without a password, as Google sign-up makes them. */
async function createPasswordlessUser() {
  const [user] = await Users.create(db, {
    username: `oauth-${uniqueId()}`,
    emailAddress: `oauth-${uniqueId()}@example.com`,
    emailVerifiedAt: new Date().toISOString(),
  });
  return { user, session: makeSession(user.id) };
}

describe("AuthenticationService", () => {
  describe("signing up", () => {
    test("makes an unverified user with an Argon2 hash, sends an 8-character code and signs nobody in", async () => {
      const account = credentials();
      const result = await AuthenticationService.signUp(account.emailAddress, account.password);
      expect("session" in result).toBe(false);
      expect(result.user).toMatchObject({ emailAddress: account.emailAddress, emailVerifiedAt: null });
      expect(result.user.passwordDigest).toStartWith("$argon2");

      const verification = (await EmailVerifications.findOne(db, { userId: result.user.id }))!;
      expect(verification.code).toHaveLength(8);
      expect(new Date(verification.expiresAt).getTime()).toBeGreaterThan(Date.now());
    });

    test("refuses an email a deleted account still holds", async () => {
      // The deleted row keeps the email's unique index: this must be a conflict, not a constraint crash.
      const { session, account } = await signUpAndVerify();
      await AccountService.deleteAccount(session, account.password);
      await expect(AuthenticationService.signUp(account.emailAddress, account.password)).rejects.toThrow(ConflictError);
    });
  });

  describe("verifying the email", () => {
    test("signs the user in with the code sent, once", async () => {
      const account = credentials();
      const { user } = await AuthenticationService.signUp(account.emailAddress, account.password);
      const code = await codeFor(user.id);
      expect(await AuthenticationService.verifyEmail(account.emailAddress, code)).toMatchObject({
        session: { userId: user.id },
        user: { id: user.id },
      });
      await expect(AuthenticationService.verifyEmail(account.emailAddress, code)).rejects.toThrow(BadRequestError);
    });

    test("refuses a wrong or expired code", async () => {
      const account = credentials();
      const { user } = await AuthenticationService.signUp(account.emailAddress, account.password);
      await expect(AuthenticationService.verifyEmail(account.emailAddress, "000000")).rejects.toThrow(
        UnauthorizedError,
      );

      const verification = (await EmailVerifications.findOne(db, { userId: user.id }))!;
      await db
        .update(emailVerificationsInAccount)
        .set({ expiresAt: ago(1000) })
        .where(eq(emailVerificationsInAccount.id, verification.id));
      await expect(AuthenticationService.verifyEmail(account.emailAddress, verification.code)).rejects.toThrow(
        UnauthorizedError,
      );
    });

    test("resends a new code once the old one is five minutes old, and tells nothing about unknown or verified emails", async () => {
      const account = credentials();
      const { user } = await AuthenticationService.signUp(account.emailAddress, account.password);
      const old = (await EmailVerifications.findOne(db, { userId: user.id }))!;
      await db
        .update(emailVerificationsInAccount)
        .set({ createdAt: ago(6 * 60 * 1000) })
        .where(eq(emailVerificationsInAccount.id, old.id));

      await AuthenticationService.resendVerification(account.emailAddress);
      const fresh = (await EmailVerifications.findOne(db, { userId: user.id }))!;
      expect(fresh.id).not.toBe(old.id);
      expect(fresh.code).toHaveLength(8);

      expect(await AuthenticationService.resendVerification("nonexistent@example.com")).toEqual({
        success: true,
      });
      expect(await AuthenticationService.resendVerification((await signUpAndVerify()).account.emailAddress)).toEqual({
        success: true,
      });
    });

    test("claims the invites sent to the address before the account existed, as signing in does", async () => {
      const { user: gm, session: gmSession } = await createTestUser();
      const invite = async (email: string) => {
        const { campaign } = await createTestCampaign(gm.id);
        const [slot] = await Players.create(db, { campaignId: campaign.id, role: "Player Character" });
        return inviteToSlot(gmSession, slot, email);
      };
      const account = credentials();
      const invites = [await invite(account.emailAddress), await invite(account.emailAddress)];
      expect(invites.map((i) => i.userId)).toEqual([null, null]);

      const { user } = await AuthenticationService.signUp(account.emailAddress, account.password);
      await AuthenticationService.verifyEmail(account.emailAddress, await codeFor(user.id));
      for (const { id } of invites) expect(await Invites.findOne(db, { id })).toMatchObject({ userId: user.id });

      // Signing in claims those sent later.
      const later = await invite(account.emailAddress);
      await AuthenticationService.signIn(account.emailAddress, account.password);
      expect(await Invites.findOne(db, { id: later.id })).toMatchObject({ userId: user.id });
    });
  });

  describe("signing in", () => {
    test("opens a new week-long session each time", async () => {
      const { session: first, user, account } = await signUpAndVerify();
      const before = Date.now();
      const second = await AuthenticationService.signIn(account.emailAddress, account.password);
      const after = Date.now();

      expect(second.user).toMatchObject({ id: user.id, emailAddress: account.emailAddress });
      expect(second.session.id).not.toBe(first.id);
      const week = 7 * 24 * 60 * 60 * 1000;
      const expiresAt = new Date(second.session.expiresAt).getTime();
      expect(expiresAt).toBeGreaterThanOrEqual(before + week);
      expect(expiresAt).toBeLessThanOrEqual(after + week);
    });

    test("refuses an unknown email, a wrong password and an unverified email", async () => {
      const { account } = await signUpAndVerify();
      const invalid = new UnauthorizedError("Invalid email or password");
      await expect(AuthenticationService.signIn("nonexistent@example.com", "password1234")).rejects.toEqual(invalid);
      await expect(AuthenticationService.signIn(account.emailAddress, "wrong-password")).rejects.toEqual(invalid);

      const unverified = credentials();
      await AuthenticationService.signUp(unverified.emailAddress, unverified.password);
      await expect(AuthenticationService.signIn(unverified.emailAddress, unverified.password)).rejects.toEqual(
        new UnauthorizedError("Email not verified"),
      );
    });

    test("rehashes a legacy SHA-256 password with Argon2", async () => {
      const { user, account } = await signUpAndVerify();
      const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(account.password));
      await Users.update(
        db,
        {
          passwordDigest: Array.from(new Uint8Array(digest))
            .map((b) => b.toString(16).padStart(2, "0"))
            .join(""),
        },
        { id: user.id },
      );

      // A wrong password against it is refused, and leaves it as it is
      await expect(AuthenticationService.signIn(account.emailAddress, "wrong-password")).rejects.toThrow(
        UnauthorizedError,
      );
      expect((await Users.findOne(db, { id: user.id }))!.passwordDigest).not.toStartWith("$argon2");

      await AuthenticationService.signIn(account.emailAddress, account.password);
      expect((await Users.findOne(db, { id: user.id }))!.passwordDigest).toStartWith("$argon2");
    });
  });

  test("signs out, ending the session, and refuses a session that doesn't exist", async () => {
    const { session } = await signUpAndVerify();
    await AuthenticationService.signOut(session);
    expect(await Sessions.findOne(db, { id: session.id })).toBeUndefined();
    await expect(AuthenticationService.signOut(missingSession)).rejects.toEqual(new InternalError("Session not found"));
  });

  test("reads the signed-in user without the password digest", async () => {
    const { session, user, account } = await signUpAndVerify();
    const me = await AuthenticationService.getCurrentUser(session);
    expect(me).toMatchObject({ id: user.id, emailAddress: account.emailAddress, createdAt: expect.any(String) });
    expect("passwordDigest" in me).toBe(false);
    await expect(AuthenticationService.getCurrentUser(missingSession)).rejects.toEqual(
      new InternalError("User not found"),
    );
  });

  describe("the demo", () => {
    test("makes a verified user with a made-up email that expires with its session", async () => {
      const demo = await AuthenticationService.startDemo();
      expect(demo).toMatchObject({
        reused: false,
        user: {
          emailAddress: expect.stringMatching(/^demo-[0-9a-f-]+@demo\.invalid$/),
          emailVerifiedAt: expect.any(String),
        },
      });
      expect(new Date(demo.user.expiresAt!).getTime()).toBeGreaterThan(Date.now());
      expect(demo.session.expiresAt).toBe(demo.user.expiresAt!);
    });

    test("carries on with the demo session it's given, ignores an unknown one, and refuses a real user's", async () => {
      const first = await AuthenticationService.startDemo();
      expect(await AuthenticationService.startDemo(first.session.id)).toMatchObject({
        reused: true,
        session: { id: first.session.id },
        user: { id: first.user.id },
      });
      expect(await AuthenticationService.startDemo(NIL_UUID)).toMatchObject({ reused: false });
      // It would replace their cookie with a demo one.
      await expect(AuthenticationService.startDemo((await signUpAndVerify()).session.id)).rejects.toThrow(
        BadRequestError,
      );
    });

    test("never touches an expired demo user: sweeping them is the cleanup job's", async () => {
      const expired = await AuthenticationService.startDemo();
      await Users.update(db, { expiresAt: ago(1000) }, { id: expired.user.id });
      expect((await AuthenticationService.startDemo()).user.id).not.toBe(expired.user.id);
      expect(await Users.findOne(db, { id: expired.user.id })).toBeDefined();
    });

    test("deletes the demo user when it signs out, or signs in or verifies a real account, but not when that fails", async () => {
      const signedOut = await AuthenticationService.startDemo();
      await AuthenticationService.signOut(signedOut.session);
      expect(await Users.findOne(db, { id: signedOut.user.id })).toBeUndefined();
      expect(await Sessions.findOne(db, { id: signedOut.session.id })).toBeUndefined();

      const { account } = await signUpAndVerify();
      const failing = await AuthenticationService.startDemo();
      await expect(
        AuthenticationService.signIn(account.emailAddress, "wrong-password", failing.session.id),
      ).rejects.toThrow(UnauthorizedError);
      expect(await Users.findOne(db, { id: failing.user.id })).toBeDefined();
      expect(
        (await AuthenticationService.signIn(account.emailAddress, account.password, failing.session.id)).user
          .emailAddress,
      ).toBe(account.emailAddress);
      expect(await Users.findOne(db, { id: failing.user.id })).toBeUndefined();

      const verifying = await AuthenticationService.startDemo();
      const newAccount = credentials();
      const { user } = await AuthenticationService.signUp(newAccount.emailAddress, newAccount.password);
      await AuthenticationService.verifyEmail(newAccount.emailAddress, await codeFor(user.id), verifying.session.id);
      expect(await Users.findOne(db, { id: verifying.user.id })).toBeUndefined();
    });
  });

  describe("the profile", () => {
    test("renames the user, and holds a new email until its code comes back", async () => {
      const { session, user, account } = await signUpAndVerify();
      const renamed = await AccountService.updateProfile(session, "newusername", undefined);
      expect(renamed).toMatchObject({
        username: "newusername",
        emailAddress: account.emailAddress,
        pendingEmailAddress: null,
      });
      expect("passwordDigest" in renamed).toBe(false);

      const newEmail = `new-${account.emailAddress}`;
      expect(await AccountService.updateProfile(session, undefined, newEmail)).toMatchObject({
        emailAddress: account.emailAddress,
        pendingEmailAddress: newEmail,
      });
      expect(await AccountService.verifyEmailChange(session, await codeFor(user.id))).toMatchObject({
        emailAddress: newEmail,
        pendingEmailAddress: null,
      });
    });

    test("refuses an email or a username another account uses", async () => {
      const { account: taken } = await signUpAndVerify();
      const { session: first } = await signUpAndVerify();
      await AccountService.updateProfile(first, "uniqueusername", undefined);
      const { session } = await signUpAndVerify();
      await expect(AccountService.updateProfile(session, undefined, taken.emailAddress)).rejects.toThrow(
        BadRequestError,
      );
      await expect(AccountService.updateProfile(session, "uniqueusername", undefined)).rejects.toThrow(BadRequestError);
    });

    test("refuses to confirm a new email with a wrong or expired code, without one pending, or once another account took it", async () => {
      const { session, user, account } = await signUpAndVerify();
      await expect(AccountService.verifyEmailChange(session, "123456")).rejects.toThrow(BadRequestError);

      const contested = `contested-${uniqueId()}@example.com`;
      await AccountService.updateProfile(session, undefined, contested);
      await expect(AccountService.verifyEmailChange(session, "000000")).rejects.toThrow(UnauthorizedError);
      const verification = (await EmailVerifications.findOne(db, { userId: user.id }))!;

      const otherAccount = credentials();
      const other = await AuthenticationService.signUp(otherAccount.emailAddress, otherAccount.password);
      await Users.update(
        db,
        { emailAddress: contested, emailVerifiedAt: new Date().toISOString() },
        { id: other.user.id },
      );
      await expect(AccountService.verifyEmailChange(session, verification.code)).rejects.toThrow(BadRequestError);

      await db
        .update(emailVerificationsInAccount)
        .set({ expiresAt: ago(1000) })
        .where(eq(emailVerificationsInAccount.id, verification.id));
      await expect(AccountService.verifyEmailChange(session, verification.code)).rejects.toThrow(UnauthorizedError);
      expect((await Users.findOne(db, { id: user.id }))!.emailAddress).toBe(account.emailAddress);
    });

    test("resends a pending email's code after five minutes, and cancels the change", async () => {
      const { session, user, account } = await signUpAndVerify();
      await expect(AccountService.resendEmailChange(session)).rejects.toThrow(BadRequestError);
      await AccountService.updateProfile(session, undefined, `new-${account.emailAddress}`);
      await expect(AccountService.resendEmailChange(session)).rejects.toThrow(BadRequestError);

      const old = (await EmailVerifications.findOne(db, { userId: user.id }))!;
      await db
        .update(emailVerificationsInAccount)
        .set({ createdAt: ago(6 * 60 * 1000) })
        .where(eq(emailVerificationsInAccount.id, old.id));
      expect(await AccountService.resendEmailChange(session)).toEqual({ success: true });
      expect((await EmailVerifications.findOne(db, { userId: user.id }))!.id).not.toBe(old.id);

      await AccountService.cancelEmailChange(session);
      expect(await Users.findOne(db, { id: user.id })).toMatchObject({ pendingEmailAddress: null });
    });
  });

  describe("the password", () => {
    test("changes with the current one, signing out the user's other sessions", async () => {
      const { session, account } = await signUpAndVerify();
      const [other] = await Sessions.create(db, { userId: session.userId });
      const change = (currentPassword: string, newPassword: string) =>
        AccountService.updatePassword(session, currentPassword, newPassword);

      await expect(change("wrongpassword", "newpassword1234")).rejects.toEqual(
        new UnauthorizedError("Current password is incorrect"),
      );
      await expect(change(account.password, account.password)).rejects.toThrow(BadRequestError);
      expect(await change(account.password, "newpassword1234")).toEqual({ success: true });

      expect(await Sessions.findOne(db, { id: other.id })).toBeUndefined();
      expect(await Sessions.findOne(db, { id: session.id })).toBeDefined();
      expect((await AuthenticationService.signIn(account.emailAddress, "newpassword1234")).user.id).toBe(
        session.userId,
      );
    });

    test("is set once for an account without one", async () => {
      const { session } = await createPasswordlessUser();
      expect(await AccountService.setPassword(session, "firstpassword1")).toEqual({ success: true });
      await expect(AccountService.setPassword(session, "second12345")).rejects.toThrow(BadRequestError);
    });

    describe("forgotten", () => {
      test("sends a reset code, once every five minutes, and tells nothing about unknown emails", async () => {
        const { user, account } = await signUpAndVerify();
        expect(await AuthenticationService.forgotPassword(account.emailAddress)).toEqual({
          success: true,
        });
        const reset = (await PasswordResets.findOne(db, { userId: user.id }))!;
        expect(reset.code).toHaveLength(8);

        await AuthenticationService.forgotPassword(account.emailAddress);
        expect((await PasswordResets.findOne(db, { userId: user.id }))!.id).toBe(reset.id);
        expect(await AuthenticationService.forgotPassword("nonexistent@example.com")).toEqual({
          success: true,
        });
      });

      test("is reset with the code, signing out every session of the user's and nobody else's", async () => {
        const { session, user, account } = await signUpAndVerify();
        const [second] = await Sessions.create(db, { userId: user.id });
        const { session: someoneElse } = await signUpAndVerify();
        await AuthenticationService.forgotPassword(account.emailAddress);
        const reset = (await PasswordResets.findOne(db, { userId: user.id }))!;
        const resetWith = (code: string) =>
          AuthenticationService.resetPassword(account.emailAddress, code, "replacement1234");

        await expect(resetWith("000000")).rejects.toThrow(UnauthorizedError);
        expect(await resetWith(reset.code)).toEqual({ success: true });

        for (const { id } of [session, second]) expect(await Sessions.findOne(db, { id })).toBeUndefined();
        expect(await Sessions.findOne(db, { id: someoneElse.id })).toBeDefined();
        expect((await AuthenticationService.signIn(account.emailAddress, "replacement1234")).user.id).toBe(user.id);
      });

      test("refuses an expired code", async () => {
        const { user, account } = await signUpAndVerify();
        await AuthenticationService.forgotPassword(account.emailAddress);
        const reset = (await PasswordResets.findOne(db, { userId: user.id }))!;
        await db
          .update(passwordResetsInAccount)
          .set({ expiresAt: ago(1000) })
          .where(eq(passwordResetsInAccount.id, reset.id));
        await expect(
          AuthenticationService.resetPassword(account.emailAddress, reset.code, "newpassword1234"),
        ).rejects.toThrow(UnauthorizedError);
      });
    });
  });

  test("refuses to unlink a provider that isn't linked", async () => {
    const { session } = await signUpAndVerify();
    await expect(LinkedAccountsService.unlinkOauthAccount(session, "google")).rejects.toThrow(BadRequestError);
    expect(await LinkedAccountsService.getLinkedAccounts(session)).toEqual([]);
  });

  // What follows Google verifying an ID token: the Google account's id (`sub`) and email
  describe("Google", () => {
    const googleAccount = (email = `google-${uniqueId()}@example.com`) => ({ sub: `google-${uniqueId()}`, email });

    test("signs up a new user, verified, with the invites sent to their email, then signs them in as that user", async () => {
      const account = googleAccount();
      const { user: gm, session: gmSession } = await createTestUser("gm");
      const { campaign } = await createTestCampaign(gm.id);
      const [slot] = await Players.create(db, { campaignId: campaign.id, role: "Player Character" });
      const invite = await inviteToSlot(gmSession, slot, account.email);

      const { user } = await signInAsGoogleAccount({ ...account, email: account.email.toUpperCase() });
      expect(user).toMatchObject({
        emailAddress: account.email,
        hasPassword: false,
        emailVerifiedAt: expect.any(String),
      });
      expect((await Invites.findOne(db, { id: invite!.id }))!.userId).toBe(user.id);
      expect(await LinkedAccountsService.getLinkedAccounts(makeSession(user.id))).toMatchObject([
        { provider: "google" },
      ]);

      const again = await signInAsGoogleAccount(account);
      expect(again.user.id).toBe(user.id);
      expect(again.session.userId).toBe(user.id);
    });

    test("links the account with its email, and verifies it", async () => {
      const account = credentials();
      const { user } = await AuthenticationService.signUp(account.emailAddress, account.password);
      expect(user.emailVerifiedAt).toBeNull();

      const signedIn = await signInAsGoogleAccount(googleAccount(account.emailAddress));
      expect(signedIn.user).toMatchObject({ id: user.id, hasPassword: true, emailVerifiedAt: expect.any(String) });
      expect(await EmailVerifications.findOne(db, { userId: user.id })).toBeUndefined();
      expect(await LinkedAccountsService.getLinkedAccounts(makeSession(user.id))).toMatchObject([
        { provider: "google" },
      ]);
    });

    test("refuses the email of a deleted account", async () => {
      const { session, account } = await signUpAndVerify();
      await AccountService.deleteAccount(session, account.password);
      await expect(signInAsGoogleAccount(googleAccount(account.emailAddress))).rejects.toThrow(ConflictError);
    });

    test("links an account to the signed-in user, once, and never to another user", async () => {
      const { session } = await signUpAndVerify();
      const { session: other } = await signUpAndVerify();
      const { sub } = googleAccount();
      expect(await linkGoogleAccountTo(session, sub)).toEqual({ success: true });
      await expect(linkGoogleAccountTo(session, sub)).rejects.toThrow("already linked to your account");
      await expect(linkGoogleAccountTo(other, sub)).rejects.toThrow("already linked to another user");

      // Signing in with it is signing in as that user, whatever email Google gives now
      expect((await signInAsGoogleAccount({ sub, email: `renamed-${uniqueId()}@example.com` })).user.id).toBe(
        session.userId,
      );
    });

    test("unlinks an account from a user with a password, but not from one without", async () => {
      const { session } = await signUpAndVerify();
      await linkGoogleAccountTo(session, googleAccount().sub);
      expect(await LinkedAccountsService.unlinkOauthAccount(session, "google")).toEqual({
        success: true,
      });
      expect(await LinkedAccountsService.getLinkedAccounts(session)).toEqual([]);

      const { user } = await signInAsGoogleAccount(googleAccount());
      await expect(LinkedAccountsService.unlinkOauthAccount(makeSession(user.id), "google")).rejects.toThrow(
        "without a password set",
      );
      expect(await LinkedAccountsService.getLinkedAccounts(makeSession(user.id))).toHaveLength(1);
    });
  });

  describe("deleting the account", () => {
    test("archives the user with their characters, campaign seats and sessions, and hands their rulesets to nobody", async () => {
      const { session, user, account } = await signUpAndVerify();
      const character = await createTestCharacter(user.id);
      const ruleset = await createTestRuleset(user.id, { private: false });
      await createTestCampaign(user.id);

      expect(await AccountService.deleteAccount(session, account.password)).toEqual({
        success: true,
      });

      expect(await Users.findOne(db, { id: user.id })).toBeUndefined();
      expect(await Characters.findOne(db, { id: character.id }, Visibility.UnarchivedOnly)).toBeUndefined();
      expect(await Players.findMany(db, { userId: user.id })).toEqual([]);
      expect(await Sessions.findOne(db, { id: session.id })).toBeUndefined();
      expect(await Rulesets.findOne(db, { id: ruleset.id })).toMatchObject({ userId: null });
      await expect(AuthenticationService.signIn(account.emailAddress, account.password)).rejects.toThrow(
        UnauthorizedError,
      );
    });

    test("asks for the password when there is one", async () => {
      const { session } = await signUpAndVerify();
      await expect(AccountService.deleteAccount(session, "wrong-password")).rejects.toThrow(UnauthorizedError);
      await expect(AccountService.deleteAccount(session, undefined)).rejects.toEqual(
        new BadRequestError("Password is required"),
      );

      const passwordless = await createPasswordlessUser();
      await OauthAccounts.create(db, {
        userId: passwordless.user.id,
        provider: "google",
        providerAccountId: `google-${uniqueId()}`,
      });
      expect(await AccountService.deleteAccount(passwordless.session, undefined)).toEqual({
        success: true,
      });
      expect(await Users.findOne(db, { id: passwordless.user.id })).toBeUndefined();
    });
  });
});
