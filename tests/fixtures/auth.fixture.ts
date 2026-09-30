/** Users the test data seeds (database/seeds/users.ts), whose password is 'LocalTest123!'. */
export const TEST_USERS = {
  /** For the signed-out tests. */
  user1: { email: 'testuser1@example.com', password: 'LocalTest123!' },
  /** The owner of the seeded characters (database/seeds/characters.ts), for tests that only read them. */
  seedUser: { email: 'localuser@example.com', password: 'LocalTest123!' },
} as const;
