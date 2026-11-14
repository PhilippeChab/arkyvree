import type { Db } from "@/drizzle/database.ts";
import { db, withWrite } from "@/server/database/index.ts";
import { NotFoundError } from "@/server/errors/index.ts";
import { Locks, Users } from "@/server/repositories/index.ts";
import { InstancePolicy } from "@/server/services/policies/index.ts";
import type { Session, User } from "@/shared/relations.ts";

import { BUSY_ACCOUNT_MESSAGE } from "./userWrites.ts";

/** What an instance's write that gave up on a lock answers: another save held its settings. */
const BUSY_INSTANCE_MESSAGE = "This Arkyvree's settings are being changed by another save; try again";

/**
 * Refuses (403) a session that isn't one of the instance's admins, before a write of theirs takes any lock: nobody else
 * learns which accounts there are, nor holds the settings' lock. The write's policy checks again under its locks.
 */
async function assertAdministers(session: Session) {
  (await InstancePolicy.for(db, session)).canAdminister();
}

/**
 * Locks the instance's settings (`Locks.lockSettings`), after the accounts a write locks: the writes that read who its
 * admins are, or who may make an account, take turns. A new account's write takes it before it reads the settings.
 */
export async function lockInstanceSettings(tx: Db) {
  await Locks.lockSettings(tx, "no key update");
}

/**
 * Runs an admin's write of an account of the instance (`userId`: made an admin, deactivated, its email verified), once
 * the session is an admin's (`assertAdministers`): its row locked first, then the instance's settings, so the writes
 * that count its admins take turns; refused as not found (404) when no live account has the id.
 */
export async function withAdministeredAccount<T>(
  session: Session,
  userId: string,
  write: (tx: Db, account: User) => Promise<T>,
): Promise<T> {
  await assertAdministers(session);
  return await withWrite(async (tx) => {
    await Locks.lockUser(tx, userId, "no key update");
    await lockInstanceSettings(tx);
    const account = await Users.findOne(tx, { id: userId });
    if (!account) throw new NotFoundError("Account not found");
    return await write(tx, account);
  }, BUSY_ACCOUNT_MESSAGE);
}

/**
 * Runs an admin's write of the instance's settings (who may make an account), once the session is an admin's
 * (`assertAdministers`), its settings locked first.
 */
export async function withInstanceWrite<T>(session: Session, write: (tx: Db) => Promise<T>): Promise<T> {
  await assertAdministers(session);
  return await withWrite(async (tx) => {
    await lockInstanceSettings(tx);
    return await write(tx);
  }, BUSY_INSTANCE_MESSAGE);
}
