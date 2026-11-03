import { afterAll, expect, test } from "bun:test";

import { db } from "@/server/database/index.ts";
import { createTestPool } from "@/server/database/test.ts";
import { ConflictError } from "@/server/errors/index.ts";
import { Locks, OauthAccounts, Users } from "@/server/repositories/index.ts";
import { signInAsGoogleAccount } from "@/server/services/authentication/index.ts";
import { linkGoogleAccountTo } from "@/server/services/authentication/linkedAccounts/index.ts";
import { CommittedUsers } from "@/tests/support/CommittedUsers.ts";
import { runWhileCommitting } from "@/tests/support/database.ts";
import { uniqueId } from "@/tests/support/seed.ts";
import { createTestUser } from "@/tests/support/users.ts";

const pool = createTestPool();

/** The demo users the probes committed, which another connection sees: deleted once every test rolled back. */
const users = new CommittedUsers(pool);

afterAll(async () => {
  await users.deleteAll();
  await pool.end();
});

test("two sign-ins of one Google account at once link it once: the second signs in as its returning user", async () => {
  const user = await users.commit("google");
  const sub = `google-${uniqueId()}`;
  // The first sign-in holds the account, links it and commits
  const signIn = await runWhileCommitting(
    pool,
    (blockerDb) => Locks.lockUser(blockerDb, user.id, "no key update"),
    () => signInAsGoogleAccount({ email: user.emailAddress, sub }),
    ({ blockerDb }) => OauthAccounts.create(blockerDb, { userId: user.id, provider: "google", providerAccountId: sub }),
  );
  expect(signIn).toMatchObject({ user: { id: user.id } });
});

test("a sign-in that waits for its account's deletion makes a new account, the address being free", async () => {
  const user = await users.commit("google");
  const sub = `google-${uniqueId()}`;
  // The account's deletion holds its row, archives it and commits
  const { user: made } = await users.runDuringDeletion(user.id, () =>
    signInAsGoogleAccount({ email: user.emailAddress, sub }),
  );
  expect(made.emailAddress).toBe(user.emailAddress);
  expect(made.id).not.toBe(user.id);
  expect(await OauthAccounts.findOne(db, { provider: "google", providerAccountId: sub })).toMatchObject({
    userId: made.id,
  });
});

test("a Google account's link from the settings that another link commits first is refused as a conflict", async () => {
  const linked = await users.commit("google");
  const { session } = await createTestUser("linking");
  const sub = `google-${uniqueId()}`;
  // Another request links the same Google account, not yet committed: this one's insert waits on its index
  const link = runWhileCommitting(
    pool,
    (blockerDb) => OauthAccounts.create(blockerDb, { userId: linked.id, provider: "google", providerAccountId: sub }),
    () => linkGoogleAccountTo(session, sub),
  );
  expect(link).rejects.toEqual(new ConflictError("This Google account is already linked to an account"));
});

test("two first sign-ins of a new Google account at once make it once: the second signs in to the first's", async () => {
  const id = uniqueId();
  const email = `google-${id}@demo.invalid`;
  const sub = `google-${id}`;
  let first: { id: string } | undefined;
  // The first sign-in makes the account and its link, not yet committed: this one's account waits on its index
  const signIn = await runWhileCommitting(
    pool,
    async (blockerDb) => {
      [first] = await Users.create(blockerDb, {
        emailAddress: email,
        expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      });
      users.add(first.id);
      await OauthAccounts.create(blockerDb, { userId: first.id, provider: "google", providerAccountId: sub });
    },
    () => signInAsGoogleAccount({ email, sub }),
  );
  expect(signIn).toMatchObject({ user: { id: first?.id } });
});

// The outcome alone: `develop` reached the address's new account too, unlocked, where the sign-in now runs again and
// locks it, which a test can't tell apart
test("a sign-in whose account's address moves while it waits links the address's account now, never the old one", async () => {
  const former = await users.commit("google");
  const email = former.emailAddress;
  const sub = `google-${uniqueId()}`;
  let current: { id: string } | undefined;
  // The account holds its row, changes its address and commits; another account takes the address
  const signIn = await runWhileCommitting(
    pool,
    (blockerDb) => Locks.lockUser(blockerDb, former.id, "no key update"),
    () => signInAsGoogleAccount({ email, sub }),
    async ({ blockerDb }) => {
      await Users.update(blockerDb, { emailAddress: `moved-${uniqueId()}@demo.invalid` }, { id: former.id });
      [current] = await Users.create(blockerDb, {
        emailAddress: email,
        expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      });
      users.add(current.id);
    },
  );
  expect(signIn).toMatchObject({ user: { id: current?.id } });
  expect((await OauthAccounts.findOne(db, { provider: "google", providerAccountId: sub }))?.userId).toBe(current?.id);
});
