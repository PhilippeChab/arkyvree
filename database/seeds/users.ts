import { sessionsInAccount, usersInAccount } from "@/drizzle/schema.ts";
import type { Db } from "@/server/database/index.ts";

const PASSWORD_DIGEST = "6fc914e8107f52a500ae8d6f5fd9b7ca677440c2fea38b2a9ec6b3143eb91c2b";

export default async function seed(db: Db) {
  const now = new Date().toISOString();
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

  // testuser1..testuser3 keep their long-standing UUIDs because backend
  // integration tests reference them as session/user identifiers.
  // testuser4..testuser19 are claimed by the per-worker e2e fixture so
  // parallel Playwright runs never collide on shared state.
  const seeded: Array<{ id: string; email: string; username: string; sessionId: string }> = [
    { id: "00000000-0000-4000-8000-000000000456", email: "localuser@example.com", username: "LocalUser", sessionId: "00000000-0000-4000-8000-000000000123" },
    { id: "10000000-0000-4000-8000-000000000789", email: "testuser1@example.com", username: "TestUser1", sessionId: "10000000-0000-4000-8000-000000000789" },
    { id: "10000000-0000-4000-8000-000000000999", email: "testuser2@example.com", username: "TestUser2", sessionId: "10000000-0000-4000-8000-000000000999" },
    { id: "10000000-0000-4000-8000-000000000888", email: "testuser3@example.com", username: "TestUser3", sessionId: "10000000-0000-4000-8000-000000000888" },
  ];
  for (let n = 4; n <= 19; n++) {
    const padded = String(n).padStart(3, "0");
    seeded.push({
      id: `20000000-0000-4000-8000-000000000${padded}`,
      email: `testuser${n}@example.com`,
      username: `TestUser${n}`,
      sessionId: `20000000-0000-4000-8000-000000000${padded}`,
    });
  }

  // The first entry (LocalUser) keeps the original onboarding-not-set state so
  // the dev account hits the onboarding wizard locally; everyone else has it
  // pre-completed so journey tests skip the wizard.
  await db.insert(usersInAccount).values(
    seeded.map((u, i) => ({
      id: u.id,
      emailAddress: u.email,
      passwordDigest: PASSWORD_DIGEST,
      username: u.username,
      emailVerifiedAt: now,
      ...(i === 0 ? {} : { onboardingCompletedAt: now }),
    })),
  );

  await db.insert(sessionsInAccount).values(
    seeded.map((u) => ({ id: u.sessionId, userId: u.id, expiresAt })),
  );
}
