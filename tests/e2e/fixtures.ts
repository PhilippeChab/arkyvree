/* eslint-disable react-hooks/rules-of-hooks, no-empty-pattern --
 * `use` is Playwright's fixture callback (not a React hook), and the
 * empty `{}` destructure is the documented signature for fixtures that
 * don't depend on other fixtures.
 */
import { test as base, type Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { PASSWORD_DIGEST } from '@/database/seeds/users.ts';
import { recordCoverage } from '@/tests/e2e/coverage.ts';

type E2EUser = { email: string; password: string; username: string };

/** Creates a verified, onboarded user (if the email isn't taken), with the seeded users' password. */
async function createUser(email: string, username: string): Promise<E2EUser> {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    await client.query(
      `INSERT INTO account.users (email_address, password_digest, username, email_verified_at, onboarding_completed_at)
       VALUES ($1, $2, $3, now(), now()) ON CONFLICT (email_address) DO NOTHING`,
      [email, PASSWORD_DIGEST, username],
    );
  } finally {
    await client.end();
  }
  return { email, password: 'LocalTest123!', username };
}

/*
 * Users the tests sign in as, created as they're used, so parallel tests can't collide on a user's state and a run
 * takes as many workers as it likes: `ownerUser` and `inviteeUser` are the worker's, for journeys that build their
 * own content; `user` is the test's alone, for one that changes the user (their email, their password, their session).
 */
export const test = base.extend<{ page: Page; user: E2EUser }, { ownerUser: E2EUser; inviteeUser: E2EUser }>({
  // The client code each test's page runs, when the run records coverage
  page: async ({ page }, use) => {
    await recordCoverage(page, () => use(page));
  },
  user: async ({}, use) => {
    const id = randomUUID().slice(0, 8);
    await use(await createUser(`e2e-user-${id}@example.com`, `E2E user ${id}`));
  },
  ownerUser: [async ({}, use, { workerIndex }) => use(await createUser(`e2e-owner-${workerIndex}@example.com`, `E2E owner ${workerIndex}`)), { scope: 'worker' }],
  inviteeUser: [async ({}, use, { workerIndex }) => use(await createUser(`e2e-invitee-${workerIndex}@example.com`, `E2E invitee ${workerIndex}`)), { scope: 'worker' }],
});

export { expect } from '@playwright/test';
