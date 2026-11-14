import { afterAll, describe, expect, test } from "bun:test";

import { SEED_USER_ID } from "@/scripts/db/seeds/users.ts";
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
import { createTestUser } from "@/tests/support/users.ts";

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

/** The instance as the test reads it: its seeded admin no longer one, so it has none. */
async function removeAdmins() {
  await Users.update(db, { isAdmin: false }, { id: SEED_USER_ID });
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
  test("the first account of an instance without an admin becomes its admin, whatever its setting", async () => {
    await removeAdmins();
    await setPolicy("Closed");
    const account = credentials();
    const { user } = await AuthenticationService.signUp(account.emailAddress, account.password);
    expect(user.isAdmin).toBe(true);

    // The next one meets the setting
    const next = credentials();
    expect(AuthenticationService.signUp(next.emailAddress, next.password)).rejects.toEqual(
      new ForbiddenError(CLOSED_MESSAGE),
    );
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
    const account = credentials();
    // Another first sign-up holds the settings, makes its admin and commits: this one's waits, then counts it
    const { user } = await runWhileCommitting(
      pool,
      (blockerDb) => Locks.lockSettings(blockerDb, "no key update"),
      () => AuthenticationService.signUp(account.emailAddress, account.password),
      async ({ blockerDb }) => {
        const [first] = await Users.create(blockerDb, {
          emailAddress: `first-${uniqueId()}@example.com`,
          isAdmin: true,
        });
        users.add(first.id);
      },
    );
    expect(user.isAdmin).toBe(false);
  });
});
