import type { Db } from "@/drizzle/database.ts";
import { withWrite } from "@/server/database/index.ts";
import { BusyError, UnauthorizedError } from "@/server/errors/index.ts";
import { isVisible, Locks, Users, Visibility } from "@/server/repositories/index.ts";
import type { User } from "@/shared/relations.ts";

/**
 * The account a write makes rows for, which it locks shared before anything else (`lockAccount`): the session's
 * (`userId`: a new character's owner, a fork's, a campaign's creator), or the one an address names (`email`: an
 * invite's invitee, none when no account has it).
 */
export type NamedAccount = { email: string } | { userId: string };

/** What a write whose address named another account under its locks than before answers: an invite's invitee. */
const BUSY_INVITEE_MESSAGE = "The invited account is being changed by another save; try again";

/** What an account's write that gave up on a lock answers: another save held the account. */
export const BUSY_ACCOUNT_MESSAGE = "Your account is being changed by another save; try again";

/**
 * Checks, under the locks a write took after its account's (`account`, locked as `lockAccount` answered: `lockedId`),
 * that an address still names the account it locked: one that moved to another account, or that an account took
 * meanwhile, is refused as busy (409), so the write never makes a row for an account it didn't lock.
 */
export async function assertAccountStill(tx: Db, account: NamedAccount, lockedId: string | undefined) {
  if ("userId" in account) return;
  const current = await Users.findOne(tx, { emailAddress: account.email });
  if (current?.id !== lockedId) throw new BusyError(BUSY_INVITEE_MESSAGE);
}

/**
 * Locks the account a write makes rows for (`account`) shared, before what else it locks, as users lock before
 * rulesets, campaigns and characters: an account's deletion, which locks it first, waits for the rows the write makes,
 * or makes the write wait and is seen by it. The session's account, gone, is refused as its session is (401); an
 * address's answers the id of the account it locked, none when no live account has the address.
 */
export async function lockAccount(tx: Db, account: NamedAccount): Promise<string | undefined> {
  if ("userId" in account) {
    const locked = await Locks.lockUser(tx, account.userId, "share");
    if (!isVisible(locked, Visibility.UnarchivedOnly)) throw new UnauthorizedError("Invalid session");
    return locked.id;
  }
  const found = await Users.findOne(tx, { emailAddress: account.email });
  const locked = found && (await Locks.lockUser(tx, found.id, "share"));
  return isVisible(locked, Visibility.UnarchivedOnly) ? locked.id : undefined;
}

/**
 * Locks accounts (`userIds`) and what they own, in the order every write takes them, in a write that deletes or
 * empties them (an account's deletion, a demo's purge): their rows, then their rulesets, then the campaigns they hold a
 * seat or an invite in, then their characters, masters first, so the write waits on each one's writes and none on it
 * in a cycle. Their characters are read after the wait on their campaigns: what another account's deletion in one of
 * those campaigns handed them as it held it is theirs by then, and locked with the rest.
 */
export async function lockAccounts(tx: Db, userIds: string[]) {
  await Locks.lockUsers(tx, userIds, "no key update");
  await Locks.lockRulesets(tx, { userIds }, "no key update");
  await Locks.lockCampaigns(tx, { userIds }, "no key update");
  await Locks.lockCharacters(tx, { userIds }, "no key update");
}

/**
 * Runs a write of accounts that deletes or empties them (`userIds`: an account's deletion, a demo's purge, the cleanup
 * of expired demos), everything they own locked first (`lockAccounts`).
 */
export async function withAccountDeletion<T>(userIds: string[], write: (tx: Db) => Promise<T>): Promise<T> {
  return await withWrite(async (tx) => {
    await lockAccounts(tx, userIds);
    return await write(tx);
  }, BUSY_ACCOUNT_MESSAGE);
}

/**
 * Runs a write of an account found by what it's named by (`find`: its address, its Google link), outside the lock: the
 * account's row locked, then read again (`user`, archived or not), so the write acts on the account as it stands under
 * its lock; none when `find` finds none, or the account is gone since. Every write of an account locks its row first,
 * so two of one account take turns.
 */
export async function withAccountFoundBy<T>(
  find: (tx: Db) => Promise<string | undefined>,
  write: (tx: Db, user: User | undefined) => Promise<T>,
): Promise<T> {
  return await withWrite(async (tx) => {
    const id = await find(tx);
    const locked = id ? await Locks.lockUser(tx, id, "no key update") : undefined;
    const user = locked ? await Users.findOne(tx, { id: locked.id }, Visibility.All) : undefined;
    return await write(tx, user);
  }, BUSY_ACCOUNT_MESSAGE);
}

/**
 * Runs a job's write of an account's rows (`userId`: a PDF's export and its notifications), its row locked first, as
 * the session's writes of them do (`withAccountWrite`): none once the account is gone, which has nobody left to tell.
 */
export async function withAccountJob<T>(userId: string, write: (tx: Db) => Promise<T>): Promise<T | undefined> {
  return await withWrite(async (tx) => {
    const locked = await Locks.lockUser(tx, userId, "no key update");
    return isVisible(locked, Visibility.UnarchivedOnly) ? await write(tx) : undefined;
  }, BUSY_ACCOUNT_MESSAGE);
}

/**
 * Runs a write of the session's account (`userId`: its profile, its password, its keys, its links, its stars, its
 * notifications), its row locked first, so its writes take turns, and an account's deletion waits for them or makes
 * them wait: refused as its session is (401) once the account is gone.
 */
export async function withAccountWrite<T>(userId: string, write: (tx: Db, user: User) => Promise<T>): Promise<T> {
  return await withWrite(async (tx) => {
    const locked = await Locks.lockUser(tx, userId, "no key update");
    const user = isVisible(locked, Visibility.UnarchivedOnly) ? await Users.findOne(tx, { id: userId }) : undefined;
    if (!user) throw new UnauthorizedError("Invalid session");
    return await write(tx, user);
  }, BUSY_ACCOUNT_MESSAGE);
}

/**
 * Runs a write that makes a new account (`write`: a sign-up, a demo), which locks none: its address's unique index
 * refuses a second one of it (`withTakenRefusal`).
 */
export async function withNewAccount<T>(write: (tx: Db) => Promise<T>): Promise<T> {
  return await withWrite(write, BUSY_ACCOUNT_MESSAGE);
}

/**
 * Runs a write of an app's sign-in to the MCP server before any user answers it (its app's document kept, its request
 * stored), which locks no account: nothing of one is read or written. Its user's answer, and every write after it, is
 * their account's (`withAccountWrite`).
 */
export async function withSignInWrite<T>(write: (tx: Db) => Promise<T>): Promise<T> {
  return await withWrite(write);
}
