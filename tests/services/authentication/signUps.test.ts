import { afterAll, describe, expect, test } from "bun:test";

import { usersInAccount } from "@/drizzle/schema.ts";
import { db } from "@/server/database/index.ts";
import { createTestPool } from "@/server/database/test.ts";
import { ForbiddenError } from "@/server/errors/index.ts";
import {
  CharacterContributors,
  Contributors,
  InstanceSettings,
  Locks,
  OauthAccounts,
  Players,
  Users,
} from "@/server/repositories/index.ts";
import { AuthenticationService, signInAsGoogleAccount } from "@/server/services/authentication/index.ts";
import { CLOSED_MESSAGE, INVITE_ONLY_MESSAGE } from "@/server/services/authentication/signUps.ts";
import type { SignUpPolicy } from "@/shared/enums.ts";
import { createTestCampaign, inviteToSlot } from "@/tests/support/campaigns.ts";
import { CommittedUsers } from "@/tests/support/CommittedUsers.ts";
import { runWhileCommitting } from "@/tests/support/database.ts";
import { createTestCharacter } from "@/tests/support/dnd3.5/characters.ts";
import { createTestRuleset } from "@/tests/support/rulesets.ts";
import { uniqueId } from "@/tests/support/seed.ts";
import { createTestUser, findVerificationCode } from "@/tests/support/users.ts";

const pool = createTestPool();

/** The users the probes committed, which another connection sees: deleted once every test rolled back. */
const users = new CommittedUsers(pool);

/** A new address and a password, which no account holds. */
function credentials() {
  const id = uniqueId();
  return { emailAddress: `signup-${id}@example.com`, password: `password-${id}` };
}

/** A Google account no account is linked to yet, as its ID token names it. */
function googleAccount() {
  const id = uniqueId();
  return { email: `google-${id}@example.com`, sub: `google-${id}` };
}

/** The instance as the test reads it: no account an admin (its seeded one, and those a probe committed), so it has none. */
async function removeAdmins() {
  await db.update(usersInAccount).set({ isAdmin: false });
}

/** Sets who may make an account on the instance, within the test's transaction. */
async function setPolicy(signUpPolicy: SignUpPolicy) {
  await InstanceSettings.update(db, { signUpPolicy });
}

afterAll(async () => {
  await users.deleteAll();
  await pool.end();
});

describe("who may make an account", () => {
  test("the first account of an instance without an admin becomes its admin once it's verified, whatever its setting", async () => {
    await removeAdmins();
    await setPolicy("Closed");
    const account = credentials();
    const { user } = await AuthenticationService.signUp(account.emailAddress, account.password);
    expect(user.isAdmin).toBe(false);
    const verified = await AuthenticationService.verifyEmail(account.emailAddress, await findVerificationCode(user.id));
    expect(verified.user.isAdmin).toBe(true);

    // The next one meets the setting
    const next = credentials();
    expect(AuthenticationService.signUp(next.emailAddress, next.password)).rejects.toEqual(
      new ForbiddenError(CLOSED_MESSAGE),
    );
  });

  test("a first sign-up that never verifies blocks nobody: the next that verifies becomes admin, alone", async () => {
    await removeAdmins();
    await setPolicy("Closed");
    const first = credentials();
    const second = credentials();
    const { user: unverified } = await AuthenticationService.signUp(first.emailAddress, first.password);
    // Without an admin who can sign in, the instance still takes accounts
    const { user } = await AuthenticationService.signUp(second.emailAddress, second.password);
    const { user: admin } = await AuthenticationService.verifyEmail(
      second.emailAddress,
      await findVerificationCode(user.id),
    );
    expect(admin.isAdmin).toBe(true);

    // The first, verified later, finds an admin: it's no second one
    const { user: later } = await AuthenticationService.verifyEmail(
      first.emailAddress,
      await findVerificationCode(unverified.id),
    );
    expect(later.isAdmin).toBe(false);
    expect(await Users.count(db, { isAdmin: true })).toBe(1);
  });

  test("a Google account linked to an unverified first sign-up verifies it, and makes it the admin", async () => {
    await removeAdmins();
    const account = credentials();
    const { user } = await AuthenticationService.signUp(account.emailAddress, account.password);
    const linked = await signInAsGoogleAccount({ email: account.emailAddress, sub: `google-${uniqueId()}` });
    expect(linked.user).toMatchObject({ id: user.id, isAdmin: true });
  });

  test("a Google account's first sign-in on an instance without an admin makes its admin", async () => {
    await removeAdmins();
    const { user } = await signInAsGoogleAccount(googleAccount());
    expect(user.isAdmin).toBe(true);
  });

  test("an open instance takes anyone, and a later account isn't an admin", async () => {
    await setPolicy("Open");
    const account = credentials();
    const { user } = await AuthenticationService.signUp(account.emailAddress, account.password);
    expect(user.isAdmin).toBe(false);
    expect((await signInAsGoogleAccount(googleAccount())).user.isAdmin).toBe(false);
  });

  test("a closed instance takes nobody, by email or by Google, before any code is sent", async () => {
    await setPolicy("Closed");
    const account = credentials();
    expect(AuthenticationService.signUp(account.emailAddress, account.password)).rejects.toEqual(
      new ForbiddenError(CLOSED_MESSAGE),
    );
    expect(await Users.findOne(db, { emailAddress: account.emailAddress })).toBeUndefined();

    const google = googleAccount();
    expect(signInAsGoogleAccount(google)).rejects.toEqual(new ForbiddenError(CLOSED_MESSAGE));
    expect(await Users.findOne(db, { emailAddress: google.email })).toBeUndefined();
  });

  test("a closed instance still signs in its accounts, and links a Google account to one", async () => {
    const { user } = await createTestUser("closed");
    await Users.update(db, { emailVerifiedAt: new Date().toISOString() }, { id: user.id });
    await setPolicy("Closed");
    const sub = `google-${uniqueId()}`;
    expect((await signInAsGoogleAccount({ email: user.emailAddress, sub })).user.id).toBe(user.id);
    expect(await OauthAccounts.findOne(db, { provider: "google", providerAccountId: sub })).toMatchObject({
      userId: user.id,
    });
    expect((await AuthenticationService.signIn(user.emailAddress, "password1234")).user.id).toBe(user.id);
  });

  describe("an instance that takes invites alone", () => {
    test("refuses an address no invite was sent to, by email or by Google", async () => {
      await setPolicy("Invite Only");
      const account = credentials();
      expect(AuthenticationService.signUp(account.emailAddress, account.password)).rejects.toEqual(
        new ForbiddenError(INVITE_ONLY_MESSAGE),
      );
      expect(signInAsGoogleAccount(googleAccount())).rejects.toEqual(new ForbiddenError(INVITE_ONLY_MESSAGE));
    });

    test("takes an address invited to a campaign", async () => {
      const { user: gm, session: gmSession } = await createTestUser("gm");
      const { campaign } = await createTestCampaign(gm.id);
      const [slot] = await Players.create(db, { campaignId: campaign.id, role: "Player Character" });
      const account = credentials();
      await inviteToSlot(gmSession, slot, account.emailAddress);
      await setPolicy("Invite Only");
      const { user } = await AuthenticationService.signUp(account.emailAddress, account.password);
      expect(user.emailAddress).toBe(account.emailAddress);
    });

    test("takes an address invited to contribute to a ruleset, or to a character, by email or by Google", async () => {
      const { user: owner } = await createTestUser("owner");
      const ruleset = await createTestRuleset(owner.id);
      const character = await createTestCharacter(owner.id);
      const byRuleset = credentials();
      const byCharacter = googleAccount();
      await Contributors.create(db, {
        rulesetId: ruleset.id,
        email: byRuleset.emailAddress,
        role: "Editor",
        invitedBy: owner.id,
      });
      await CharacterContributors.create(db, {
        characterId: character.id,
        email: byCharacter.email,
        role: "Editor",
        invitedBy: owner.id,
      });
      await setPolicy("Invite Only");
      const { user } = await AuthenticationService.signUp(byRuleset.emailAddress, byRuleset.password);
      expect(user.emailAddress).toBe(byRuleset.emailAddress);
      expect((await signInAsGoogleAccount(byCharacter)).user.emailAddress).toBe(byCharacter.email);
    });

    test("refuses an address whose invite was answered or revoked", async () => {
      const { user: owner } = await createTestUser("owner");
      const ruleset = await createTestRuleset(owner.id);
      const account = credentials();
      const [invite] = await Contributors.create(db, {
        rulesetId: ruleset.id,
        email: account.emailAddress,
        role: "Editor",
        invitedBy: owner.id,
      });
      await Contributors.update(db, { status: "Revoked" }, { id: invite.id });
      await setPolicy("Invite Only");
      expect(AuthenticationService.signUp(account.emailAddress, account.password)).rejects.toEqual(
        new ForbiddenError(INVITE_ONLY_MESSAGE),
      );
    });
  });
});

describe("the instance's first sign-ups at once", () => {
  test("make one admin: the second waits for the first, then finds it", async () => {
    await removeAdmins();
    // Another first account, made verified, holds the settings, becomes the admin and commits: this Google account's
    // first sign-in, made verified too, waits, then counts it
    const { user } = await runWhileCommitting(
      pool,
      (blockerDb) => Locks.lockSettings(blockerDb, "no key update"),
      () => signInAsGoogleAccount(googleAccount()),
      async ({ blockerDb }) => {
        const [first] = await Users.create(blockerDb, {
          emailAddress: `first-${uniqueId()}@example.com`,
          emailVerifiedAt: new Date().toISOString(),
          isAdmin: true,
        });
        users.add(first.id);
      },
    );
    expect(user.isAdmin).toBe(false);
  });

  test("a verification that waits for another to become the admin isn't a second one", async () => {
    await removeAdmins();
    // An unverified account and its code, made without the sign-up's lock of the settings, which the test would hold
    const { user: signedUp } = await createTestUser("waiting");
    await AuthenticationService.resendVerification(signedUp.emailAddress);
    const account = { emailAddress: signedUp.emailAddress };
    const code = await findVerificationCode(signedUp.id);
    const { user } = await runWhileCommitting(
      pool,
      (blockerDb) => Locks.lockSettings(blockerDb, "no key update"),
      () => AuthenticationService.verifyEmail(account.emailAddress, code),
      async ({ blockerDb }) => {
        const [first] = await Users.create(blockerDb, {
          emailAddress: `first-${uniqueId()}@example.com`,
          emailVerifiedAt: new Date().toISOString(),
          isAdmin: true,
        });
        users.add(first.id);
      },
    );
    expect(user.isAdmin).toBe(false);
  });
});
