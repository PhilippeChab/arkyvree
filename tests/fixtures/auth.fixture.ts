/** Users the test data seeds (scripts/db/seeds/users.ts), whose password is 'LocalTest123!'. */
export const TEST_USERS = {
  /** For the signed-out tests. */
  user1: { email: "testuser1@example.com", password: "LocalTest123!" },
  /** The owner of the seeded characters (content/dnd3.5/testData/characters.ts): the e2e fixtures' `seedUser`. */
  seedUser: { email: "localuser@example.com", password: "LocalTest123!" },
} as const;
