/* eslint-disable react-hooks/rules-of-hooks, no-empty-pattern --
 * `use` is Playwright's fixture callback (not a React hook), and the
 * empty `{}` destructure is the documented signature for fixtures that
 * don't depend on other fixtures.
 */
import { test as base } from '@playwright/test';

/**
 * Pool of seeded test users (testuser4..testuser19). Each Playwright worker
 * claims a disjoint owner + invitee pair via the `ownerUser` / `inviteeUser`
 * fixtures so parallel journey tests can't collide on shared DB state.
 *
 * 8 owner slots + 8 invitee slots cover up to 8 parallel workers, the
 * typical default on Bun's max-CPU runner. If we ever need more, extend
 * the seed in `database/seeds/users.ts` and bump POOL_SIZE.
 */
const OWNER_OFFSET = 4;   // testuser4..testuser11
const INVITEE_OFFSET = 12; // testuser12..testuser19
const POOL_SIZE = 8;

export type WorkerUser = { email: string; password: string; username: string };

function makeUser(n: number): WorkerUser {
  return {
    email: `testuser${n}@example.com`,
    password: 'LocalTest123!',
    username: `TestUser${n}`,
  };
}

export const test = base.extend<NonNullable<unknown>, { ownerUser: WorkerUser; inviteeUser: WorkerUser }>({
  ownerUser: [
    async ({}, use, workerInfo) => {
      const slot = workerInfo.parallelIndex % POOL_SIZE;
      await use(makeUser(OWNER_OFFSET + slot));
    },
    { scope: 'worker' },
  ],
  inviteeUser: [
    async ({}, use, workerInfo) => {
      const slot = workerInfo.parallelIndex % POOL_SIZE;
      await use(makeUser(INVITEE_OFFSET + slot));
    },
    { scope: 'worker' },
  ],
});

export { expect } from '@playwright/test';
