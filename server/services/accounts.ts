import { getTableName, type InferSelectModel } from "drizzle-orm";

import { oauthAccountsInAccount, sessionsInAccount, type usersInAccount } from "@/drizzle/schema.ts";
import { type Db, withTransaction } from "@/server/database/index.ts";
import { BadRequestError, ConflictError, InternalError } from "@/server/errors/index.ts";
import { Visibility } from "@/server/repositories/BaseRepository.ts";
import {
  Activities,
  CharacterContributors,
  Contributors,
  EmailVerifications,
  Invites,
  OauthAccounts,
  Sessions,
  Users,
} from "@/server/repositories/index.ts";
import type { Session } from "@/shared/relations.ts";

/** The user as a response carries it: whether a password is set, never its digest. */
export function toSafeUser(user: InferSelectModel<typeof usersInAccount>) {
  const { passwordDigest, ...safeUser } = user;
  return { ...safeUser, hasPassword: !!passwordDigest };
}

// Conversion cleanup: when a request reaches sign-in / verifyEmail / Google
// while still carrying a demo cookie, hard-delete the demo user the cookie
// points at. CASCADE wipes their fork/character/etc. immediately rather than
// waiting for lazy recycle on the next /api/demo/start.
export async function purgeDemoSessionUser(tx: Db, sessionId: string | undefined) {
  if (!sessionId) return;
  const session = await Sessions.findOne(tx, { id: sessionId });
  if (!session) return;
  const user = await Users.findOne(tx, { id: session.userId });
  if (user?.expiresAt) await Users.delete(tx, { id: user.id });
}

/**
 * Signs in the owner of a Google account Google has verified (`sub` and `email` from its ID token): its returning
 * user, the account with its email (which it links and verifies), or a new user.
 */
export async function signInAsGoogleAccount(payload: { sub: string; email: string }, existingSessionId?: string) {
  const email = payload.email.toLowerCase();

  return await withTransaction(async (tx) => {
    await purgeDemoSessionUser(tx, existingSessionId);

    // Case 1: Returning Google user
    const existingOauth = await OauthAccounts.findOne(tx, {
      provider: "google",
      providerAccountId: payload.sub,
    });

    if (existingOauth) {
      const user = await Users.findOne(tx, { id: existingOauth.userId });
      if (!user) throw new InternalError("User not found");

      const rows = await Sessions.create(tx, { userId: user.id });
      const session = rows[0];
      if (!session) throw new InternalError("Could not create session");

      await Activities.create(tx, {
        userId: user.id,
        targetId: session.id,
        targetTable: getTableName(sessionsInAccount),
        type: "signIn",
        data: { provider: "google" },
      });

      return { session, user: toSafeUser(user) };
    }

    // Case 2: Link existing account (same email). Visibility.All so the
    // email of a deleted account is recognised as taken instead of falling
    // through to Case 3 and hitting the users_email constraint.
    const existingUser = await Users.findOne(tx, { emailAddress: email }, Visibility.All);

    if (existingUser?.deletedAt) {
      throw new ConflictError("Email already in use");
    }

    if (existingUser) {
      await OauthAccounts.create(tx, {
        userId: existingUser.id,
        provider: "google",
        providerAccountId: payload.sub,
      });

      // Google verified the email: the account answers as verified
      let linkedUser = existingUser;
      if (!existingUser.emailVerifiedAt) {
        [linkedUser] = await Users.update(tx, { emailVerifiedAt: new Date().toISOString() }, { id: existingUser.id });
        await EmailVerifications.archiveAllForUser(tx, { userId: existingUser.id });
      }

      const rows = await Sessions.create(tx, { userId: existingUser.id });
      const session = rows[0];
      if (!session) throw new InternalError("Could not create session");

      await Activities.create(tx, {
        userId: existingUser.id,
        targetId: session.id,
        targetTable: getTableName(sessionsInAccount),
        type: "signIn",
        data: { provider: "google" },
      });

      await Promise.all([
        Invites.backfillUserId(tx, existingUser.emailAddress, existingUser.id),
        Contributors.backfillUserId(tx, existingUser.emailAddress, existingUser.id),
        CharacterContributors.backfillUserId(tx, existingUser.emailAddress, existingUser.id),
      ]);

      return { session, user: toSafeUser(linkedUser) };
    }

    // Case 3: New user
    const userRows = await Users.create(tx, { emailAddress: email });
    if (!userRows[0]) throw new InternalError("Could not create user");
    const [user] = await Users.update(tx, { emailVerifiedAt: new Date().toISOString() }, { id: userRows[0].id });

    await OauthAccounts.create(tx, {
      userId: user.id,
      provider: "google",
      providerAccountId: payload.sub,
    });

    const rows = await Sessions.create(tx, { userId: user.id });
    const session = rows[0];
    if (!session) throw new InternalError("Could not create session");

    await Activities.create(tx, {
      userId: user.id,
      targetId: session.id,
      targetTable: getTableName(sessionsInAccount),
      type: "signUp",
      data: { provider: "google" },
    });

    await Promise.all([
      Invites.backfillUserId(tx, user.emailAddress, user.id),
      Contributors.backfillUserId(tx, user.emailAddress, user.id),
      CharacterContributors.backfillUserId(tx, user.emailAddress, user.id),
    ]);

    return { session, user: toSafeUser(user) };
  });
}

/** Links the Google account `googleAccountId` (Google verified it) to the session's user. */
export async function linkGoogleAccountTo(session: Session, googleAccountId: string) {
  return await withTransaction(async (tx) => {
    const existing = await OauthAccounts.findOne(tx, {
      provider: "google",
      providerAccountId: googleAccountId,
    });
    if (existing) {
      if (existing.userId === session.userId) {
        throw new BadRequestError("This Google account is already linked to your account");
      }
      throw new BadRequestError("This Google account is already linked to another user");
    }

    await OauthAccounts.create(tx, {
      userId: session.userId,
      provider: "google",
      providerAccountId: googleAccountId,
    });

    await Activities.create(tx, {
      userId: session.userId,
      targetId: session.userId,
      targetTable: getTableName(oauthAccountsInAccount),
      type: "linkOauth",
      data: { provider: "google" },
    });

    return { success: true };
  });
}
