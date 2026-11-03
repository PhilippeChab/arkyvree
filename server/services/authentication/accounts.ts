import type { InferSelectModel } from "drizzle-orm";

import type { Db } from "@/drizzle/database.ts";
import type { usersInAccount } from "@/drizzle/schema.ts";
import { withUniqueRefusal } from "@/server/database/index.ts";
import { sanitizeEmail } from "@/server/emailAddress.ts";
import { ConflictError, InternalError, UnauthorizedError, UnprocessableEntityError } from "@/server/errors/index.ts";
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
import { BUSY_ACCOUNT_MESSAGE, lockAccounts, withAccountFoundBy } from "@/server/services/writes/index.ts";
import { TARGET_TYPES } from "@/shared/activityTargets.ts";
import type { User } from "@/shared/relations.ts";

/** A field that's one account's alone: its email address or its username. */
type AccountField = "emailAddress" | "username";

/** What an account is found by, besides its id: its email address or its username. */
type AccountIdentifier = { emailAddress: string } | { username: string };

/** The unique index that keeps a Google account linked to one user (`drizzle/schema.ts`). */
const GOOGLE_LINK_INDEX = "oauth_accounts_provider_provider_account_id";

/**
 * The cause of a refusal a Google sign-in runs again, once (`signInAsGoogleAccount`): another request won a race its
 * locks couldn't cover (a first sign-in of the same Google account, an address change), whose account the rerun finds
 * and locks.
 */
const RERUN_CAUSE = "googleSignInRace";

/** The unique indexes that keep an email address or a username one account's (`drizzle/schema.ts`), by name. */
const UNIQUE_INDEXES = new Map<string, AccountField>([
  ["users_email", "emailAddress"],
  ["users_username", "username"],
]);

/** Whether `error` is a refusal a Google sign-in runs again (`RERUN_CAUSE`). */
function isRerun(error: unknown): error is ConflictError {
  return error instanceof ConflictError && error.cause === RERUN_CAUSE;
}

/** A 409 (`message`) a Google sign-in runs again (`RERUN_CAUSE`). */
function toRerun(message: string) {
  return new ConflictError(message, { cause: RERUN_CAUSE });
}

/** The refusal of an email address or a username another account holds, whichever path asks. */
function toTakenError(field: AccountField) {
  return new ConflictError(`${field === "username" ? "Username" : "Email address"} already in use`);
}

/**
 * The account that holds an email address or a username. A deletion gives up both (`Users.archive`), but an archived
 * row from before it did would still hold them on their unique indexes (`users_email`, `users_username`), so neither
 * would be free for another account (a data fix has freed those).
 */
async function findTakenUser(tx: Db, identifier: AccountIdentifier) {
  return await Users.findOne(tx, identifier, Visibility.All);
}

/**
 * One run of a Google sign-in (`signInAsGoogleAccount`): its account found, locked and read again, then signed in,
 * linked, or made. A race its lock couldn't cover is refused for a rerun (`toRerun`).
 */
async function signInGoogleOnce(payload: { email: string; sub: string }, existingSessionId?: string) {
  const email = sanitizeEmail(payload.email);

  // Its account (the one the Google account is linked to, else the one its address names) locked first, then read
  // again: two sign-ins of one Google account at once take turns, and the second signs in as the first left it
  return await withAccountFoundBy(
    async (tx) =>
      (await OauthAccounts.findOne(tx, { provider: "google", providerAccountId: payload.sub }))?.userId ??
      (await findTakenUser(tx, { emailAddress: email }))?.id,
    async (tx, found) => {
      await purgeDemoSessionUser(tx, existingSessionId);

      // Case 1: Returning Google user
      const returning = await signInLinkedGoogleAccount(tx, payload.sub);
      if (returning) return returning;

      // Case 2: Link existing account (same email), the one locked. One whose address moved while the sign-in waited
      // is no longer the address's, a deletion's among them: the rerun finds, and locks, the one that holds it now, or
      // makes one. An archived row the data fix hasn't reached still holds its address: taken, never linked
      if (found && found.emailAddress !== email) throw toRerun(BUSY_ACCOUNT_MESSAGE);
      if (found?.deletedAt) throw toTakenError("emailAddress");

      if (found) {
        await withGoogleLinkRefusal(() =>
          OauthAccounts.create(tx, { userId: found.id, provider: "google", providerAccountId: payload.sub }),
        );

        // Google verified the email: the account answers as verified. Its password goes: whoever set it never proved
        // the address, and it would let them in beside its owner
        let linkedUser = found;
        if (!found.emailVerifiedAt) {
          [linkedUser] = await Users.update(
            tx,
            { emailVerifiedAt: new Date().toISOString(), passwordDigest: null },
            { id: found.id },
          );
          await EmailVerifications.archive(tx, { userId: found.id });
        }

        const session = await openSession(tx, found, "signIn", { provider: "google" });
        return { session, user: toSafeUser(linkedUser) };
      }

      // Case 3: New user. Another first sign-in of the address that commits its account first refuses this one's on
      // its index, which the rerun finds and signs in to as its returning user
      const userRows = await withUniqueRefusal(
        () => Users.create(tx, { emailAddress: email }),
        (index) => (index === "users_email" ? toRerun(toTakenError("emailAddress").message) : undefined),
      );
      if (!userRows[0]) throw new InternalError("Could not create user");
      const [user] = await Users.update(tx, { emailVerifiedAt: new Date().toISOString() }, { id: userRows[0].id });

      await withGoogleLinkRefusal(() =>
        OauthAccounts.create(tx, { userId: user.id, provider: "google", providerAccountId: payload.sub }),
      );

      const session = await openSession(tx, user, "signUp", { provider: "google" });
      return { session, user: toSafeUser(user) };
    },
  );
}

/**
 * Signs in the user a Google account (`sub`) is linked to, if it's linked: its returning user. Undefined otherwise.
 */
async function signInLinkedGoogleAccount(tx: Db, sub: string) {
  const existingOauth = await OauthAccounts.findOne(tx, { provider: "google", providerAccountId: sub });
  if (!existingOauth) return undefined;

  // Its user deleted (its link archived with it, once its deletion commits): no returning user
  const user = await Users.findOne(tx, { id: existingOauth.userId });
  if (!user) return undefined;

  const session = await openSession(tx, user, "signIn", { provider: "google" });
  return { session, user: toSafeUser(user) };
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

/** Refuses an email address or a username an account holds, an unfixed archived row too (`findTakenUser`). */
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
  if (!user?.expiresAt) return;
  // Everything the demo owns locked first, after the account the request signs in to, as an account's deletion does
  await lockAccounts(tx, [user.id]);
  await Users.delete(tx, { id: user.id });
}

/**
 * Signs in the owner of a Google account Google has verified (`sub` and `email` from its ID token): its returning
 * user, the account with its email (which it links and verifies), or a new user. A run that lost a race its lock
 * couldn't cover (`RERUN_CAUSE`) runs again, once, as the winner left the accounts: the second of two first sign-ins
 * of a Google account signs in to the account the first made.
 */
export async function signInAsGoogleAccount(payload: { email: string; sub: string }, existingSessionId?: string) {
  try {
    return await signInGoogleOnce(payload, existingSessionId);
  } catch (error) {
    if (!isRerun(error)) throw error;
  }
  try {
    return await signInGoogleOnce(payload, existingSessionId);
  } catch (error) {
    // Lost twice: answered as a plain conflict, its cause the API's own
    throw isRerun(error) ? new ConflictError(error.message) : error;
  }
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
 * Runs a write of the account an address names (`emailAddress`: a sign-in, a reset, a verification), its row locked
 * first (`withAccountFoundBy`): none when no live account holds the address, or the one that did no longer holds it
 * under the lock.
 */
export async function withAccountByAddress<T>(
  emailAddress: string,
  write: (tx: Db, user: User | undefined) => Promise<T>,
): Promise<T> {
  return await withAccountFoundBy(
    async (tx) => (await Users.findOne(tx, { emailAddress }))?.id,
    async (tx, user) =>
      await write(tx, user && !user.deletedAt && user.emailAddress === emailAddress ? user : undefined),
  );
}

/**
 * Runs `write`, which links a Google account, answering its index's refusal with a 409: another request linked the
 * same Google account meanwhile (a sign-in's, a settings' link), whose check this one passed before it committed.
 */
export async function withGoogleLinkRefusal<T>(write: () => Promise<T>) {
  return await withUniqueRefusal(write, (index) =>
    index === GOOGLE_LINK_INDEX ? new ConflictError("This Google account is already linked to an account") : undefined,
  );
}

/**
 * Runs `check` of what a signed-in user sent (a code, a Google token) by what a signed-out request's check runs too,
 * answering its 401 with a 422: a 401 tells the client the session is gone, which this one isn't.
 */
export async function withSignedInRefusal<T>(check: () => Promise<T>) {
  try {
    return await check();
  } catch (error) {
    if (error instanceof UnauthorizedError) throw new UnprocessableEntityError(error.message);
    throw error;
  }
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
