import { describe, expect, test } from "bun:test";

import { usersInAccount } from "@/drizzle/schema.ts";
import { SEED_USER_ID } from "@/scripts/db/seeds/users.ts";
import { hashApiKeyToken } from "@/server/apiKeyTokens.ts";
import { db } from "@/server/database/index.ts";
import { ConflictError, EmailNotVerifiedError, ForbiddenError, UnauthorizedError } from "@/server/errors/index.ts";
import { findRequestSession } from "@/server/middlewares/index.ts";
import { ApiKeys, EmailVerifications, OAuthGrants, OAuthTokens, Sessions, Users } from "@/server/repositories/index.ts";
import { AccountService } from "@/server/services/authentication/account/index.ts";
import { ApiKeysService } from "@/server/services/authentication/apiKeys/index.ts";
import { AuthenticationService, signInAsGoogleAccount } from "@/server/services/authentication/index.ts";
import { InstanceService } from "@/server/services/instance/index.ts";
import { createKeyedApi, expectStatus } from "@/tests/support/api.ts";
import { createOAuthClient } from "@/tests/support/oauth.ts";
import { NIL_UUID, uniqueId } from "@/tests/support/seed.ts";
import { createTestUser, createUserWithSession, makeSession } from "@/tests/support/users.ts";

/** The seeded admin's session (LocalUser, the dev and test instances' admin). */
const admin = makeSession(SEED_USER_ID);

const DEACTIVATED = new ForbiddenError("This account was deactivated by an admin of this Arkyvree.");

const NOT_ADMIN = new ForbiddenError("Only an admin of this Arkyvree can do this");

/** A verified account with a password (`password1234`), which signs in. */
async function createVerifiedUser(prefix: string) {
  const { user, session } = await createTestUser(prefix);
  const [verified] = await Users.update(db, { emailVerifiedAt: new Date().toISOString() }, { id: user.id });
  return { user: verified, session };
}

describe("the instance's settings", () => {
  test("its admins read and change who may make an account", async () => {
    expect(await InstanceService.getSettings(admin)).toEqual({ signUpPolicy: "Open" });
    expect(await InstanceService.updateSettings(admin, "Closed")).toEqual({ signUpPolicy: "Closed" });
    expect(await AuthenticationService.getSignUpPolicy()).toEqual({ hasAdmin: true, signUpPolicy: "Closed" });
  });

  test("anyone else is refused", async () => {
    const { session } = await createTestUser("member");
    expect(InstanceService.getSettings(session)).rejects.toEqual(NOT_ADMIN);
    expect(InstanceService.updateSettings(session, "Open")).rejects.toEqual(NOT_ADMIN);
    expect(InstanceService.getAccounts(session, {}, { limit: 10, page: 1 })).rejects.toEqual(NOT_ADMIN);
  });
});

describe("the instance's accounts", () => {
  test("its admins list them, the newest first, and search them by address", async () => {
    const { user } = await createTestUser("listed");
    const { items } = await InstanceService.getAccounts(admin, {}, { limit: 50, page: 1 });
    expect(items[0]).toEqual({
      createdAt: user.createdAt,
      deactivatedAt: null,
      emailAddress: user.emailAddress,
      emailVerifiedAt: null,
      id: user.id,
      isAdmin: false,
      username: user.username,
    });
    expect(items.some((account) => account.id === SEED_USER_ID && account.isAdmin)).toBe(true);

    const search = user.emailAddress.split("@")[0].toUpperCase();
    const found = await InstanceService.getAccounts(admin, { search }, { limit: 50, page: 1 });
    expect(found.items.map((account) => account.id)).toEqual([user.id]);
  });

  test("an admin makes another account an admin, which can then administer, and takes it back", async () => {
    const { user, session } = await createVerifiedUser("promoted");
    expect((await InstanceService.setAccountAdmin(admin, user.id, true)).isAdmin).toBe(true);
    expect(await InstanceService.getSettings(session)).toEqual({ signUpPolicy: "Open" });
    expect((await InstanceService.setAccountAdmin(admin, user.id, false)).isAdmin).toBe(false);
    expect(InstanceService.getSettings(session)).rejects.toEqual(NOT_ADMIN);
  });

  test("the last admin stays one, but may step down once there's another", async () => {
    expect(InstanceService.setAccountAdmin(admin, SEED_USER_ID, false)).rejects.toEqual(
      new ConflictError("This Arkyvree needs an admin: make another account an admin first"),
    );
    // An unverified admin can't sign in: it counts for none
    const { user: unverified } = await createTestUser("unverified");
    await InstanceService.setAccountAdmin(admin, unverified.id, true);
    expect(InstanceService.setAccountAdmin(admin, SEED_USER_ID, false)).rejects.toThrow(ConflictError);
    const { user } = await createVerifiedUser("second");
    await InstanceService.setAccountAdmin(admin, user.id, true);
    expect((await InstanceService.setAccountAdmin(admin, SEED_USER_ID, false)).isAdmin).toBe(false);
  });

  test("an admin can't deactivate their own account", async () => {
    expect(InstanceService.setAccountDeactivated(admin, SEED_USER_ID, true)).rejects.toEqual(
      new ConflictError("You can't deactivate your own account"),
    );
  });

  test("anyone else changes no account", async () => {
    const { session } = await createTestUser("member");
    const { user } = await createTestUser("target");
    expect(InstanceService.setAccountAdmin(session, user.id, true)).rejects.toEqual(NOT_ADMIN);
    expect(InstanceService.setAccountDeactivated(session, user.id, true)).rejects.toEqual(NOT_ADMIN);
    expect(InstanceService.markAccountVerified(session, user.id)).rejects.toEqual(NOT_ADMIN);
    expect(await Users.findOne(db, { id: user.id })).toMatchObject({ deactivatedAt: null, isAdmin: false });
  });

  test("an admin marks an account's email verified, its codes ended, and it signs in", async () => {
    const email = `unverified-${uniqueId()}@example.com`;
    const { user } = await AuthenticationService.signUp(email, "password1234");
    expect(AuthenticationService.signIn(email, "password1234")).rejects.toEqual(new EmailNotVerifiedError());
    const marked = await InstanceService.markAccountVerified(admin, user.id);
    expect(marked.emailVerifiedAt).not.toBeNull();
    expect(await EmailVerifications.findOne(db, { userId: user.id })).toBeUndefined();
    expect((await AuthenticationService.signIn(email, "password1234")).user.id).toBe(user.id);
    // Marked again: nothing changes
    expect((await InstanceService.markAccountVerified(admin, user.id)).emailVerifiedAt).toBe(marked.emailVerifiedAt);
  });
});

describe("a deactivated account", () => {
  test("is signed out everywhere, and signs in nowhere until it's reactivated", async () => {
    const { user } = await createVerifiedUser("deactivated");
    const sub = `google-${uniqueId()}`;
    await signInAsGoogleAccount({ email: user.emailAddress, sub });
    const { session } = await AuthenticationService.signIn(user.emailAddress, "password1234");
    const { api: keyed } = await createKeyedApi(user.id);

    const deactivated = await InstanceService.setAccountDeactivated(admin, user.id, true);
    expect(deactivated.deactivatedAt).not.toBeNull();
    expect(await Sessions.findOne(db, { id: session.id })).toBeUndefined();
    expect(await ApiKeys.findMany(db, { userId: user.id })).toEqual([]);
    await expectStatus(keyed.v1.notifications.$get({ query: {} }), 401);
    expect(AuthenticationService.signIn(user.emailAddress, "password1234")).rejects.toEqual(DEACTIVATED);
    expect(signInAsGoogleAccount({ email: user.emailAddress, sub })).rejects.toEqual(DEACTIVATED);
    // Its data stays
    expect(await Users.findOne(db, { id: user.id })).toMatchObject({ emailAddress: user.emailAddress });

    await InstanceService.setAccountDeactivated(admin, user.id, false);
    expect((await AuthenticationService.signIn(user.emailAddress, "password1234")).user.id).toBe(user.id);
  });

  test("signs in with no session, key or connected app it still holds", async () => {
    const { session, user } = await createUserWithSession({ prefix: "kept" });
    const { api: keyed } = await createKeyedApi(user.id);
    const client = await createOAuthClient();
    const grant = await OAuthGrants.create(db, { clientId: client.id, readOnly: false, userId: user.id });
    const accessToken = `token-${uniqueId()}`;
    const later = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    await OAuthTokens.create(db, {
      accessDigest: hashApiKeyToken(accessToken),
      accessExpiresAt: later,
      grantId: grant.id,
      refreshDigest: hashApiKeyToken(`refresh-${uniqueId()}`),
      refreshExpiresAt: later,
    });
    // Deactivated without its sign-out, as no admin's write leaves it: each sign-in refuses it on its own
    await Users.update(db, { deactivatedAt: new Date().toISOString() }, { id: user.id });

    expect(findRequestSession(session.id)).rejects.toEqual(new UnauthorizedError("Invalid session"));
    await expectStatus(keyed.v1.notifications.$get({ query: {} }), 401);
    expect(await OAuthTokens.findOneWithUser(db, { accessDigest: hashApiKeyToken(accessToken) })).toBeUndefined();
  });
});

describe("the instance's last admin", () => {
  test("can't delete their account until another account is an admin who can sign in", async () => {
    const { user: lastAdmin, session } = await createVerifiedUser("last");
    await db.update(usersInAccount).set({ isAdmin: false });
    await Users.update(db, { isAdmin: true }, { id: lastAdmin.id });
    expect(AccountService.deleteAccount(session, "password1234")).rejects.toEqual(
      new ConflictError("You're this Arkyvree's only admin: make someone else admin before deleting your account."),
    );
    expect(await Users.findOne(db, { id: lastAdmin.id })).toBeDefined();

    // An unverified admin can't sign in: it counts for none
    const { user: unverified } = await createTestUser("unverified");
    await Users.update(db, { isAdmin: true }, { id: unverified.id });
    expect(AccountService.deleteAccount(session, "password1234")).rejects.toThrow(ConflictError);

    const { user: other } = await createVerifiedUser("other");
    await Users.update(db, { isAdmin: true }, { id: other.id });
    expect(await AccountService.deleteAccount(session, "password1234")).toEqual({ success: true });
  });
});

describe("a request in flight", () => {
  test("an account that isn't an admin's is refused before any account is looked up or locked", async () => {
    const { session } = await createTestUser("member");
    // An unknown account answers as a known one would: 403, never 404
    expect(InstanceService.setAccountAdmin(session, NIL_UUID, true)).rejects.toEqual(NOT_ADMIN);
    expect(InstanceService.setAccountDeactivated(session, NIL_UUID, true)).rejects.toEqual(NOT_ADMIN);
    expect(InstanceService.markAccountVerified(session, NIL_UUID)).rejects.toEqual(NOT_ADMIN);
  });

  test("a deactivated account's own write is refused as its session is: it makes no key to come back with", async () => {
    const { user } = await createVerifiedUser("in-flight");
    await Users.update(db, { deactivatedAt: new Date().toISOString() }, { id: user.id });
    expect(ApiKeysService.createKey({ userId: user.id }, "Late key", null, false)).rejects.toEqual(
      new UnauthorizedError("Invalid session"),
    );
    expect(await ApiKeys.findMany(db, { userId: user.id })).toEqual([]);
  });
});
