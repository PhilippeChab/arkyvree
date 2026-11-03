import type { Db } from "@/drizzle/database.ts";
import { BusyError } from "@/server/errors/index.ts";

import { withTransaction } from "./connection.ts";
import { isLockFailure, setLockTimeout } from "./lockWaits.ts";

/**
 * How long a write waits on another's lock before it gives up, answered as a conflict: writes take turns on what they
 * lock, most a few milliseconds (a character's import, a second or so, holds its ruleset's chain shared that long), so
 * a longer wait is a stuck one, which never reaches the statement timeout.
 */
const LOCK_WAIT_MILLISECONDS = 5000;

/** What a write that gave up on a lock answers when its helper names nothing more particular. */
export const BUSY_MESSAGE = "Another save is in progress; try again";

/**
 * Opens a write's transaction (`write`), the one way every write of the server opens one: its lock waits bounded
 * (`LOCK_WAIT_MILLISECONDS`), and a write that gave up on a lock, or deadlocked with another, refused as a conflict
 * (`busy`: what its helper answers, the aggregate it waited on), changing nothing, so it can be sent again. What it
 * locks it takes through `Locks` before it reads anything, in the order every write takes them: its aggregate's helper
 * (`server/services/writes/`: a ruleset's, a character's, a campaign's, an account's, an attachment's) says what. A
 * write of none (a cleanup's, a new row's) opens it here alone.
 */
export async function withWrite<T>(write: (tx: Db) => Promise<T>, busy: string = BUSY_MESSAGE): Promise<T> {
  try {
    return await withTransaction(async (tx) => {
      await setLockTimeout(tx, LOCK_WAIT_MILLISECONDS);
      return await write(tx);
    });
  } catch (error) {
    if (isLockFailure(error)) throw new BusyError(busy);
    throw error;
  }
}
