import { describe, expect, test } from "bun:test";

import { eq } from "drizzle-orm";

import { emailVerificationsInAccount, sessionsInAccount } from "@/drizzle/schema.ts";
import { db } from "@/server/database/index.ts";
import { SESSION_COOKIE_NAME } from "@/server/middlewares/session.ts";
import { EmailVerifications, OauthAccounts, PasswordResets, Users } from "@/server/repositories/index.ts";
import { apiAs, expectOk, expectStatus, guestApi, sessionIdFrom, signedInApi } from "@/tests/api.ts";
import { uniqueId } from "@/tests/helpers.ts";

const auth = guestApi.auth;
const password = "password1234";

const newEmail = (label: string) => `test+${label}+${uniqueId()}@example.com`;

async function signUp(email: string) {
  await expectOk(auth["sign-up"].$post({ json: { emailAddress: email, password, passwordConfirmation: password } }));
  return (await Users.findOne(db, { emailAddress: email }))!;
}

async function latestVerificationCode(userId: string) {
  return (await EmailVerifications.findOne(db, { userId }))!.code;
}

/** Signs up and verifies a new user, returning their session and a client signed in with it. */
async function signUpAndVerify(label: string) {
  const email = newEmail(label);
  const user = await signUp(email);
  const verified = await auth["verify-email"].$post({
    json: { emailAddress: email, code: await latestVerificationCode(user.id) },
  });
  await expectOk(verified);
  const sessionId = sessionIdFrom(verified);
  return { email, user, sessionId, api: apiAs(sessionId) };
}

describe("authentication", () => {
  describe("sign-up and verification", () => {
    test("signs up without signing in", async () => {
      const response = await auth["sign-up"].$post({
        json: { emailAddress: newEmail("signup"), password, passwordConfirmation: password },
      });
      expect(response.status).toBe(201);
      expect(await response.json()).toMatchObject({ message: "Verification email sent" });
      expect(response.headers.get("set-cookie") ?? "").not.toContain(SESSION_COOKIE_NAME);
    });

    test("refuses a password that doesn't match its confirmation", async () => {
      const response = await auth["sign-up"].$post({
        json: { emailAddress: newEmail("mismatch"), password, passwordConfirmation: `${password}-other` },
      });
      await expectStatus(response, 400);
      expect(await response.json()).toMatchObject({
        issues: [{ category: "passwordConfirmation", message: "Passwords do not match" }],
      });
    });

    test("verifies the email with the code sent, signing the user in", async () => {
      const email = newEmail("verify");
      const user = await signUp(email);
      const response = await auth["verify-email"].$post({
        json: { emailAddress: email, code: await latestVerificationCode(user.id) },
      });
      expect(response.status).toBe(200);
      const body = await expectOk(response);
      expect(body).toMatchObject({ id: user.id, emailAddress: email });
      expect(body).not.toHaveProperty("passwordDigest");
      expect(sessionIdFrom(response)).toEqual(expect.any(String));
    });

    test("refuses a wrong code", async () => {
      const email = newEmail("badcode");
      await signUp(email);
      await expectStatus(auth["verify-email"].$post({ json: { emailAddress: email, code: "000000" } }), 401);
    });

    test("resends the verification code", async () => {
      const email = newEmail("resend");
      await signUp(email);
      expect(await expectOk(auth["resend-verification"].$post({ json: { emailAddress: email } }))).toEqual({
        success: true,
      });
    });
  });

  describe("sessions", () => {
    test("signs in, reads the user and signs out", async () => {
      const { email, user } = await signUpAndVerify("signin");
      const response = await auth["sign-in"].$post({ json: { emailAddress: email, password } });
      const signedIn = await expectOk(response);
      expect(signedIn).toMatchObject({ id: user.id, emailAddress: email, hasPassword: true });
      expect(signedIn).not.toHaveProperty("passwordDigest");

      const client = apiAs(sessionIdFrom(response));
      const me = await expectOk(client.auth.me.$get());
      expect(me).toMatchObject({ id: user.id, emailAddress: email });
      expect(me).not.toHaveProperty("passwordDigest");

      await expectOk(client.auth["sign-out"].$post());
      await expectStatus(client.auth.me.$get(), 401);
    });

    test("refuses to sign in before the email is verified", async () => {
      const email = newEmail("unverified");
      await signUp(email);
      const response = await auth["sign-in"].$post({ json: { emailAddress: email, password } });
      await expectStatus(response, 401);
      expect(await response.json()).toMatchObject({ message: expect.stringContaining("Email not verified") });
    });

    test("refuses an expired session", async () => {
      const { sessionId, api } = await signUpAndVerify("expired");
      await db
        .update(sessionsInAccount)
        .set({ expiresAt: new Date(Date.now() - 1000).toISOString() })
        .where(eq(sessionsInAccount.id, sessionId));
      await expectStatus(api.auth.me.$get(), 401);
    });

    test("requires a session for /me", async () => {
      await expectStatus(auth.me.$get(), 401);
    });
  });

  describe("profile and email change", () => {
    test("renames the user and holds a new email until it's verified", async () => {
      const { email, user, api } = await signUpAndVerify("profile");
      const changed = newEmail("profile-new");

      const updated = await expectOk(
        api.auth.profile.$put({ json: { username: "testusername", emailAddress: changed } }),
      );
      expect(updated).toMatchObject({ username: "testusername", emailAddress: email, pendingEmailAddress: changed });
      expect(updated).not.toHaveProperty("passwordDigest");

      await expectStatus(api.auth["verify-email-change"].$post({ json: { code: "000000" } }), 401);
      const verified = await expectOk(
        api.auth["verify-email-change"].$post({ json: { code: await latestVerificationCode(user.id) } }),
      );
      expect(verified).toMatchObject({ emailAddress: changed, pendingEmailAddress: null });
      expect(verified).not.toHaveProperty("passwordDigest");
    });

    test("refuses an email another account uses", async () => {
      const first = await signUpAndVerify("taken");
      const { api } = await signUpAndVerify("taker");
      const response = await api.auth.profile.$put({ json: { emailAddress: first.email } });
      await expectStatus(response, 400);
      expect(await response.json()).toMatchObject({ message: expect.stringContaining("Email address already in use") });
    });

    test("resends and cancels a pending email change", async () => {
      const { user, api } = await signUpAndVerify("pending");
      await expectOk(api.auth.profile.$put({ json: { emailAddress: newEmail("pending-new") } }));

      // Past the resend cooldown.
      const verification = await EmailVerifications.findOne(db, { userId: user.id });
      await db
        .update(emailVerificationsInAccount)
        .set({ createdAt: new Date(Date.now() - 6 * 60 * 1000).toISOString() })
        .where(eq(emailVerificationsInAccount.id, verification!.id));
      expect(await expectOk(api.auth["resend-email-change"].$post())).toEqual({ success: true });

      expect(await expectOk(api.auth["cancel-email-change"].$post())).toEqual({ success: true });
      expect(await expectOk(api.auth.me.$get())).toMatchObject({ pendingEmailAddress: null });
    });

    test("records that onboarding is done", async () => {
      const { api } = await signUpAndVerify("onboarding");
      await expectOk(api.auth["complete-onboarding"].$post());
      expect((await expectOk(api.auth.me.$get())).onboardingCompletedAt).toEqual(expect.any(String));
    });
  });

  describe("passwords", () => {
    test("changes the password", async () => {
      const { email, api } = await signUpAndVerify("password");
      const json = {
        currentPassword: password,
        newPassword: "newpassword456",
        newPasswordConfirmation: "newpassword456",
      };
      expect(await expectOk(api.auth.password.$put({ json }))).toEqual({ success: true });
      await expectOk(auth["sign-in"].$post({ json: { emailAddress: email, password: "newpassword456" } }));
    });

    test("refuses a wrong current password", async () => {
      const { api } = await signUpAndVerify("wrongpassword");
      const response = await api.auth.password.$put({
        json: {
          currentPassword: "wrongpassword",
          newPassword: "newpassword456",
          newPasswordConfirmation: "newpassword456",
        },
      });
      await expectStatus(response, 401);
      expect(await response.json()).toMatchObject({
        message: expect.stringContaining("Current password is incorrect"),
      });
    });

    test("resets a forgotten password with the code sent", async () => {
      const { email, user } = await signUpAndVerify("forgot");
      expect(await expectOk(auth["forgot-password"].$post({ json: { emailAddress: email } }))).toEqual({
        success: true,
      });
      const reset = {
        emailAddress: email,
        newPassword: "resetpassword1234",
        newPasswordConfirmation: "resetpassword1234",
      };

      await expectStatus(auth["reset-password"].$post({ json: { ...reset, code: "000000" } }), 401);
      const { code } = (await PasswordResets.findOne(db, { userId: user.id }))!;
      expect(await expectOk(auth["reset-password"].$post({ json: { ...reset, code } }))).toEqual({ success: true });
      await expectOk(auth["sign-in"].$post({ json: { emailAddress: email, password: "resetpassword1234" } }));
    });

    test("sets a first password for an account without one", async () => {
      const email = newEmail("oauth");
      const [user] = await Users.create(db, {
        username: `oauth-${uniqueId()}`,
        emailAddress: email,
        emailVerifiedAt: new Date().toISOString(),
      });
      const api = await signedInApi(user.id);
      const json = { newPassword: "firstpassword1", newPasswordConfirmation: "firstpassword1" };

      const mismatched = await api.auth["set-password"].$post({
        json: { ...json, newPasswordConfirmation: "different1" },
      });
      await expectStatus(mismatched, 400);
      expect(await expectOk(api.auth["set-password"].$post({ json }))).toEqual({ success: true });
      await expectOk(auth["sign-in"].$post({ json: { emailAddress: email, password: "firstpassword1" } }));
      await expectStatus(api.auth["set-password"].$post({ json }), 400);
    });
  });

  describe("linked accounts", () => {
    test("lists and unlinks a linked Google account", async () => {
      const { user, api } = await signUpAndVerify("linked");
      await OauthAccounts.create(db, {
        userId: user.id,
        provider: "google",
        providerAccountId: `google-${uniqueId()}`,
      });

      expect(await expectOk(api.auth["linked-accounts"].$get())).toMatchObject([{ provider: "google" }]);
      expect(await expectOk(api.auth["unlink-oauth"].$post({ json: { provider: "google" } }))).toEqual({
        success: true,
      });
      expect(await expectOk(api.auth["linked-accounts"].$get())).toEqual([]);
    });

    test("keeps the only way to sign in: no unlinking without a password", async () => {
      const [user] = await Users.create(db, {
        username: `oauth-${uniqueId()}`,
        emailAddress: newEmail("oauthonly"),
        emailVerifiedAt: new Date().toISOString(),
      });
      await OauthAccounts.create(db, {
        userId: user.id,
        provider: "google",
        providerAccountId: `google-${uniqueId()}`,
      });
      const api = await signedInApi(user.id);
      await expectStatus(api.auth["unlink-oauth"].$post({ json: { provider: "google" } }), 400);
    });
  });

  describe("account deletion", () => {
    test("deletes the account with its password and ends the session", async () => {
      const { api } = await signUpAndVerify("delete");
      await expectStatus(api.auth["delete-account"].$post({ json: { password: "wrongpassword" } }), 401);

      const response = await api.auth["delete-account"].$post({ json: { password } });
      expect(await expectOk(response)).toEqual({ success: true });
      expect(response.headers.get("set-cookie")).toContain(`${SESSION_COOKIE_NAME}=`);
      await expectStatus(api.auth.me.$get(), 401);
    });
  });
});
