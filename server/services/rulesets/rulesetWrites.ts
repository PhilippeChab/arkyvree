import type { Db } from "@/drizzle/database.ts";
import { type LockedRulesetScope, RulesetViews, withLockedRulesetScope } from "@/server/cow/index.ts";
import { isLockFailure, setLockTimeout, withTransaction } from "@/server/database/index.ts";
import { ConflictError, NotFoundError } from "@/server/errors/index.ts";
import { Rulesets } from "@/server/repositories/index.ts";
import type { RulesetsPolicy } from "@/server/services/policies/index.ts";
import type { Ruleset, Session } from "@/shared/relations.ts";

import { getReadableRuleset } from "./readableRuleset.ts";

/**
 * What a ruleset's write drops of its views once it commits (`drops`) and reads of other rulesets, locked with its
 * source chain (`reads`).
 */
interface RulesetWriteOptions {
  drops?: "entities" | "everything";
  reads?: readonly string[];
}

/**
 * How long a ruleset's write waits on another's lock before it gives up, answered as a conflict: writes to a ruleset
 * take turns, each a few milliseconds, so a longer wait is a stuck one, which never reaches the statement timeout.
 */
const LOCK_WAIT_MILLISECONDS = 5000;

/** What a write that gave up on a lock answers: another change of the ruleset held it, so it can be sent again. */
export const BUSY_RULESET_MESSAGE = "The ruleset is being changed by another save; try again";

/**
 * Runs a write's transaction (`run`), a write that gave up on a lock refused as a conflict (`BUSY_RULESET_MESSAGE`).
 */
async function refuseBusy<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if (isLockFailure(error)) throw new ConflictError(BUSY_RULESET_MESSAGE);
    throw error;
  }
}

/** Opens a write's transaction (`write`), its lock waits bounded (`LOCK_WAIT_MILLISECONDS`). */
async function withBoundedTransaction<T>(write: (tx: Db) => Promise<T>): Promise<T> {
  return await withTransaction(async (tx) => {
    await setLockTimeout(tx, LOCK_WAIT_MILLISECONDS);
    return await write(tx);
  });
}

/**
 * Runs a write that reads none of a ruleset's entities (`rulesetId`), the session's policy on the ruleset, if the
 * session may read it (`getReadableRuleset`), taken under its lock (`withRulesetLock`).
 */
export async function withLockedRuleset<T>(
  session: Session,
  rulesetId: string,
  write: (tx: Db, policy: RulesetsPolicy, ruleset: Ruleset) => Promise<T>,
  mode: "no key update" | "share" = "no key update",
): Promise<T> {
  return await withRulesetLock(
    rulesetId,
    async (tx) => {
      const { policy, ruleset } = await getReadableRuleset(tx, session, rulesetId);
      return await write(tx, policy, ruleset);
    },
    mode,
  );
}

/**
 * Runs a write that reads none of a ruleset's entities (`rulesetId`), which decides the session's rights itself (an
 * invite's answer, by an invitee who can't read the ruleset yet): of its own row alone (its status, its contributors),
 * its row locked first (`mode`, exclusive), as a write of its content locks it (`withRulesetWrite`), so the two take
 * turns; or of a ruleset it's the source of (a fork's), its row shared (`share`), so no write of it runs meanwhile. Its
 * content version stays as it is: no view of it changes. A write that gave up on the lock is refused as a conflict.
 */
export async function withRulesetLock<T>(
  rulesetId: string,
  write: (tx: Db) => Promise<T>,
  mode: "no key update" | "share" = "no key update",
): Promise<T> {
  return await refuseBusy(() =>
    withBoundedTransaction(async (tx) => {
      if (!(await Rulesets.lock(tx, { id: rulesetId }, mode))) throw new NotFoundError("Ruleset not found");
      return await write(tx);
    }),
  );
}

/**
 * Runs a write to a ruleset (`rulesetId`), the one way every write of a ruleset's own rows opens its transaction: its
 * locks taken before it reads anything (`withLockedRulesetScope`: the ruleset's, then its source chain's, shared), its
 * view read fresh under them, the session's policy on the ruleset, if the session may read it (`getReadableRuleset`,
 * the 404 an unknown ruleset gets otherwise), and what else it reads of other rulesets locked with its chain
 * (`reads`). A write that waited on another past `LOCK_WAIT_MILLISECONDS`, or deadlocked with one, is refused as a
 * conflict (`BUSY_RULESET_MESSAGE`), changing nothing. Once it commits, the ruleset's views drop what it changed
 * (`drops`: everything, or its entities alone, `RulesetViews.invalidateEntities`, for a change that leaves its target
 * paths, a requirement's); a write that reaches other rulesets (a restore's subscribers) drops theirs itself.
 */
export async function withRulesetWrite<T>(
  session: Session,
  rulesetId: string,
  write: (tx: Db, scope: LockedRulesetScope, policy: RulesetsPolicy) => Promise<T>,
  { drops = "everything", reads = [] }: RulesetWriteOptions = {},
): Promise<T> {
  const result = await refuseBusy(() =>
    withBoundedTransaction(
      async (tx) =>
        await withLockedRulesetScope(tx, rulesetId, async (scope, policy) => await write(tx, scope, policy), {
          // The session's access, under the ruleset's lock, before its chain's locks and its view
          before: async () => (await getReadableRuleset(tx, session, rulesetId)).policy,
          reads,
        }),
    ),
  );
  if (drops === "entities") RulesetViews.invalidateEntities(rulesetId);
  else RulesetViews.invalidate(rulesetId);
  return result;
}
