import { SEED_USER_ID } from "@/scripts/db/seeds/users.ts";
import { db } from "@/server/database/index.ts";
import { EmailVerifications, Users } from "@/server/repositories/index.ts";
import type { Session } from "@/shared/relations.ts";

import { uniqueId } from "./seed.ts";

/**
 * A session for `userId` that services accept. It isn't stored, so it can't
 * sign in an API request: use `signedInApi` from `tests/support/api.ts` for that.
 */
export function makeSession(userId: string = SEED_USER_ID): Session {
  const now = new Date().toISOString();
  return {
    id: `session-${uniqueId()}`,
    userId,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
  };
}

/** A new user and a session for them. `prefix` starts the username and email. */
export async function createTestUser(prefix = "testuser") {
  const id = uniqueId();
  const [user] = await Users.create(db, {
    username: `${prefix}-${id}`,
    emailAddress: `${prefix}-${id}@example.com`,
    password: "password1234",
  });
  return { user, session: makeSession(user.id) };
}

/** The code of `userId`'s latest email verification. */
export async function findVerificationCode(userId: string) {
  return (await EmailVerifications.findOne(db, { userId }))!.code;
}
