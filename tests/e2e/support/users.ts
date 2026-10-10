import { PASSWORD_DIGEST } from "@/database/seeds/users.ts";

import { queryDatabase } from "./database.ts";

export interface E2EUser {
  email: string;
  password: string;
  username: string;
}

/** Creates a verified, onboarded user (if the email isn't taken), with the seeded users' password. */
export async function createUser(email: string, username: string): Promise<E2EUser> {
  await queryDatabase(
    `INSERT INTO account.users (email_address, password_digest, username, email_verified_at, onboarding_completed_at)
     VALUES ($1, $2, $3, now(), now()) ON CONFLICT (email_address) DO NOTHING`,
    [email, PASSWORD_DIGEST, username],
  );
  return { email, password: "LocalTest123!", username };
}
