import { test as base, expect } from '@playwright/test';

/**
 * Test users seeded in the database (from database/seeds/users.ts)
 * Password for all test users: 'LocalTest123!'
 */
export const TEST_USERS = {
  user1: {
    email: 'testuser1@example.com',
    password: 'LocalTest123!',
    userId: '00000000-0000-0000-0000-000000000789',
    sessionId: '00000000-0000-0000-0000-000000000789',
  },
  user2: {
    email: 'testuser2@example.com',
    password: 'LocalTest123!',
    userId: '00000000-0000-0000-0000-000000000999',
    sessionId: '00000000-0000-0000-0000-000000000999',
  },
  user3: {
    email: 'testuser3@example.com',
    password: 'LocalTest123!',
    userId: '00000000-0000-0000-0000-000000000888',
    sessionId: '00000000-0000-0000-0000-000000000888',
  },
} as const;

/**
 * Custom test fixture that extends Playwright's base test
 * Add custom fixtures here as needed
 */
export const test = base.extend({
  // Add custom fixtures here
});

export { expect };
