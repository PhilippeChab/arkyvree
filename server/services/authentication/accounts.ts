import type { InferSelectModel } from "drizzle-orm";

import type { Db } from "@/drizzle/database.ts";
import type { usersInAccount } from "@/drizzle/schema.ts";
import { withTransaction, withUniqueRefusal } from "@/server/database/index.ts";
import { sanitizeEmail } from "@/server/emailAddress.ts";
import { ConflictError, InternalError } from "@/server/errors/index.ts";
import {
  Activities,
  ApiKeys,
  CharacterContributors,
  Contributors,
  EmailVerifications,
  Invites,
  OauthAccounts,
  Sessions,
  Users,
  Visibility,
} from "@/server/repositories/index.ts";
import { TARGET_TYPES } from "@/shared/activityTargets.ts";

/** A field that's one account's alone: its email address or its username. */
type AccountField = "emailAddress" | "username";

/** What an account is found by, besides its id: its email address or its username. */
type AccountIdentifier = { emailAddress: string } | { username: string };

/** The unique indexes that keep an email address or a username one account's (`drizzle/schema.ts`), by name. */
const UNIQUE_INDEXES = new Map<string, AccountField>([
  ["users_email", "emailAddress"],
  ["users_username", "username"],
]);

/** The refusal of an email address or a username another account holds, whichever path asks. */
function toTakenError(field: AccountField) {
  return new ConflictError(`${field === "username" ? "Username" : "Email address"} already in use`);
}

/**
 * The account that holds an email address or a username, a deleted one too: a deleted account keeps both on their
 * unique indexes (`users_email`, `users_username`), so neither is free for another account.
 */
async function findTakenUser(tx: Db, identifier: AccountIdentifier) {
  return await Users.findOne(tx, identifier, Visibility.All);
}

/** A user as another's page shows them: their public columns (an owner, an invitee), never the rest of their account. */
export function toPublicUser(user: Pick<InferSelectModel<typeof usersInAccount>, "emailAddress" | "id" | "username">) {
  return { id: user.id, username: user.username, emailAddress: user.emailAddress };
}

/** The user as a response carries it: whether a password is set, never its digest. */
export function toSafeUser(user: InferSelectModel<typeof usersInAccount>) {
  const { passwordDigest, ...safeUser } = user;
  return { ...safeUser, hasPassword: !!passwordDigest };
}

/** Refuses an email address or a username an account holds, a deleted one too (`findTakenUser`). */
export async function assertNotTaken(tx: Db, identifier: AccountIdentifier) {
  if (await findTakenUser(tx, identifier)) throw toTakenError("username" in identifier ? "username" : "emailAddress");
}

/**
 * A new session for `user`, with its activity (`signIn`, or `signUp` for a new account): the invites sent to their
 * email before they had an account become theirs.
 */
export async function openSession(
  tx: Db,
  user: { emailAddress: string; id: string },
  type: "signIn" | "signUp",
  data?: { provider: "google" },
) {
  const [session] = await Sessions.create(tx, { userId: user.id });
  if (!session) throw new InternalError("Could not create session");

  await Activities.create(tx, {
    userId: user.id,
    targetId: session.id,
    targetType: TARGET_TYPES.sessions,
    type,
    data,
  });

  await Invites.backfillUserId(tx, user.emailAddress, user.id);
  await Contributors.backfillUserId(tx, user.emailAddress, user.id);
  await CharacterContributors.backfillUserId(tx, user.emailAddress, user.id);

  return session;
}

/**
 * Conversion cleanup: when a request reaches sign-in / verifyEmail / Google while still carrying a demo cookie,
 * hard-delete the demo user the cookie points at. CASCADE wipes their fork/character/etc. immediately rather than
 * waiting for lazy recycle on the next /api/demo/start.
 */
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
export async function signInAsGoogleAccount(payload: { email: string; sub: string }, existingSessionId?: string) {
  const email = sanitizeEmail(payload.email);

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

      const session = await openSession(tx, user, "signIn", { provider: "google" });
      return { session, user: toSafeUser(user) };
    }

    // Case 2: Link existing account (same email). A deleted account's email stays taken, never linked.
    const existingUser = await findTakenUser(tx, { emailAddress: email });

    if (existingUser?.deletedAt) throw toTakenError("emailAddress");

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
        await EmailVerifications.archive(tx, { userId: existingUser.id });
      }

      const session = await openSession(tx, existingUser, "signIn", { provider: "google" });
      return { session, user: toSafeUser(linkedUser) };
    }

    // Case 3: New user
    const userRows = await withTakenRefusal(() => Users.create(tx, { emailAddress: email }));
    if (!userRows[0]) throw new InternalError("Could not create user");
    const [user] = await Users.update(tx, { emailVerifiedAt: new Date().toISOString() }, { id: userRows[0].id });

    await OauthAccounts.create(tx, {
      userId: user.id,
      provider: "google",
      providerAccountId: payload.sub,
    });

    const session = await openSession(tx, user, "signUp", { provider: "google" });
    return { session, user: toSafeUser(user) };
  });
}

/**
 * Signs a user out everywhere but the session `exceptId` (the one changing their password, when given): their sessions
 * ended and their API keys revoked, whatever signed in as them before cut off.
 */
export async function signOutEverywhere(tx: Db, userId: string, exceptId?: string) {
  await Sessions.archive(tx, { userId, exceptId });
  await ApiKeys.delete(tx, { userId });
}

/**
 * Runs `write`, which sets an email address or a username, answering a unique index's refusal as `assertNotTaken`
 * does: two requests that claim one value at once both pass the check, and the second one's write meets the index.
 */
export async function withTakenRefusal<T>(write: () => Promise<T>) {
  return await withUniqueRefusal(write, (index) => {
    const field = UNIQUE_INDEXES.get(index);
    return field && toTakenError(field);
  });
}
