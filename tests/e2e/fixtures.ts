import { randomUUID } from "node:crypto";

import { test as base, type Page } from "@playwright/test";

import { recordCoverage } from "@/tests/e2e/coverage.ts";
import { queryDatabase } from "@/tests/e2e/support/database.ts";
import { createUser, type E2EUser } from "@/tests/e2e/support/users.ts";
import { TEST_USERS } from "@/tests/fixtures/auth.fixture.ts";

/**
 * Users the tests sign in as, created as they're used, so parallel tests can't collide on a user's state and a run
 * takes as many workers as it likes: `ownerUser` and `inviteeUser` are the worker's, for journeys that build their own
 * content; `user` is the test's alone, for one that changes the user (their email, their password, their session).
 * `seedUser` owns the seeded characters, for tests that only read them: onboarded before any page loads, so its welcome
 * dialog doesn't open, and changed in nothing else.
 */
export const test = base.extend<
  { page: Page; user: E2EUser },
  { ownerUser: E2EUser; inviteeUser: E2EUser; seedUser: typeof TEST_USERS.seedUser }
>({
  // The client code each test's page runs, when the run records coverage
  page: async ({ page }, provide) => {
    await recordCoverage(page, () => provide(page));
  },
  user: async ({}, provide) => {
    const id = randomUUID().slice(0, 8);
    await provide(await createUser(`e2e-user-${id}@example.com`, `E2E user ${id}`));
  },
  ownerUser: [
    async ({}, provide, { workerIndex }) =>
      provide(await createUser(`e2e-owner-${workerIndex}@example.com`, `E2E owner ${workerIndex}`)),
    { scope: "worker" },
  ],
  inviteeUser: [
    async ({}, provide, { workerIndex }) =>
      provide(await createUser(`e2e-invitee-${workerIndex}@example.com`, `E2E invitee ${workerIndex}`)),
    { scope: "worker" },
  ],
  seedUser: [
    async ({}, provide) => {
      await queryDatabase(
        "UPDATE account.users SET onboarding_completed_at = now() WHERE email_address = $1 AND onboarding_completed_at IS NULL",
        [TEST_USERS.seedUser.email],
      );
      await provide(TEST_USERS.seedUser);
    },
    { scope: "worker" },
  ],
});
