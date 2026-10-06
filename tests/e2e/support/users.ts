import pg from "pg";

import { PASSWORD_DIGEST } from "@/database/seeds/users.ts";

export type E2EUser = { email: string; password: string; username: string };

/** Runs `sql` on the run's database, for what the API has no way to do: its rows. */
export async function queryDatabase<Row extends pg.QueryResultRow>(sql: string, params: unknown[]): Promise<Row[]> {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    return (await client.query<Row>(sql, params)).rows;
  } finally {
    await client.end();
  }
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
