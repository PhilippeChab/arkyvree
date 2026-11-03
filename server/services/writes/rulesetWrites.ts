import type { Db } from "@/drizzle/database.ts";
import { type LockedRulesetScope, RulesetViews, withLockedRulesetScope } from "@/server/cow/index.ts";
import { withWrite } from "@/server/database/index.ts";
import { NotFoundError } from "@/server/errors/index.ts";
import { Contributors, Locks } from "@/server/repositories/index.ts";
import type { RulesetsPolicy } from "@/server/services/policies/index.ts";
import { getReadableRuleset, getRulesetPolicy } from "@/server/services/rulesets/index.ts";
import type { Ruleset, Session } from "@/shared/relations.ts";

import { assertAccountStill, lockAccount, type NamedAccount } from "./userWrites.ts";

/**
 * The account a write of a ruleset's contributor makes rows for, locked shared before its ruleset (`account`: an
 * acceptance's invitee), what an unknown contributor answers (`notFound`: a contributor's words, or an invite's for
 * its answer), and the ruleset its path names (`rulesetId`), whose contributor alone it writes.
 */
interface ContributorLockOptions {
  account?: NamedAccount;
  notFound: string;
  rulesetId?: string;
}

/**
 * How a write of a ruleset's own row locks it (`mode`: alone, or shared for a ruleset it's the source of), and the
 * account it makes rows for, locked shared before it (`account`: a fork's owner, an invite's invitee).
 */
interface RulesetLockOptions {
  account?: NamedAccount;
  mode?: "no key update" | "share";
}

/**
 * What a ruleset's write drops of its views once it commits (`drops`) and reads of other rulesets, locked with its
 * source chain (`reads`).
 */
interface RulesetWriteOptions {
  drops?: "entities" | "everything";
  reads?: readonly string[];
}

/** What a write that gave up on a lock answers: another change of the ruleset held it, so it can be sent again. */
export const BUSY_RULESET_MESSAGE = "The ruleset is being changed by another save; try again";

/**
 * Locks a ruleset's row (`rulesetId`) for a write that reads none of its entities: of its own row alone (its status,
 * its contributors), alone (`mode`), as a write of its content locks it (`withRulesetWrite`), so the two take turns;
 * or of a ruleset it's the source of (a fork's), shared (`share`), so no write of it runs meanwhile. Its content
 * version stays as it is: no view of it changes. The account the write makes rows for (`account`) is locked shared
 * first (`lockAccount`). An unknown ruleset is refused as not found.
 */
async function lockRulesetRow(tx: Db, rulesetId: string, { account, mode = "no key update" }: RulesetLockOptions) {
  const accountId = account && (await lockAccount(tx, account));
  const locked = await Locks.lockRulesets(tx, { ids: [rulesetId] }, mode);
  if (!locked.has(rulesetId)) throw new NotFoundError("Ruleset not found");
  if (account) await assertAccountStill(tx, account, accountId);
}

/**
 * Runs a write of a ruleset's contributor (`contributorId`: an invite's answer, a role's change, a revoke) under its
 * ruleset's lock (`lockRulesetRow`), handed the session's policy on the ruleset and the ruleset, read under its lock
 * (`getRulesetPolicy`), whether or not the session may read it: the write decides the session's rights on the policy
 * (an invite's answer, by an invitee who can't read the ruleset yet). An unknown contributor is refused as not found
 * (`notFound`), and so is one of another ruleset than the path's (`rulesetId`), before any lock, so no lock of a
 * ruleset it didn't name answers it. A contributor's ruleset never changes, so it's read before the lock. An
 * acceptance locks its invitee's account shared first (`account`), so it waits for that account's deletion, and never
 * turns back the row the deletion ended. A write that gave up on a lock is refused as a conflict
 * (`BUSY_RULESET_MESSAGE`).
 */
export async function withContributorsRuleset<T>(
  session: Session,
  contributorId: string,
  write: (tx: Db, policy: RulesetsPolicy, ruleset: Ruleset) => Promise<T>,
  { account, notFound, rulesetId }: ContributorLockOptions,
): Promise<T> {
  return await withWrite(async (tx) => {
    const contributor = await Contributors.findOne(tx, { id: contributorId });
    if (!contributor || (rulesetId !== undefined && contributor.rulesetId !== rulesetId))
      throw new NotFoundError(notFound);
    await lockRulesetRow(tx, contributor.rulesetId, { account });
    const { policy, ruleset } = await getRulesetPolicy(tx, session, contributor.rulesetId);
    return await write(tx, policy, ruleset);
  }, BUSY_RULESET_MESSAGE);
}

/**
 * Runs a write that reads none of a ruleset's entities (`rulesetId`: its own row alone, or a ruleset it's the source
 * of), its row locked first (`lockRulesetRow`), then the session's policy on the ruleset, if the session may read it
 * (`getReadableRuleset`), taken under its lock. A write that gave up on a lock is refused as a conflict
 * (`BUSY_RULESET_MESSAGE`).
 */
export async function withLockedRuleset<T>(
  session: Session,
  rulesetId: string,
  write: (tx: Db, policy: RulesetsPolicy, ruleset: Ruleset) => Promise<T>,
  options: RulesetLockOptions = {},
): Promise<T> {
  return await withWrite(async (tx) => {
    await lockRulesetRow(tx, rulesetId, options);
    const { policy, ruleset } = await getReadableRuleset(tx, session, rulesetId);
    return await write(tx, policy, ruleset);
  }, BUSY_RULESET_MESSAGE);
}

/**
 * Runs a write to a ruleset (`rulesetId`), the one way every write of a ruleset's own rows opens its transaction: its
 * locks taken before it reads anything (`withLockedRulesetScope`: the ruleset's, then its source chain's, shared), its
 * view read fresh under them, the session's policy on the ruleset, if the session may read it (`getReadableRuleset`,
 * the 404 an unknown ruleset gets otherwise), and what else it reads of other rulesets locked with its chain
 * (`reads`). A write that waited on another past its lock wait (`withWrite`), or deadlocked with one, is refused as a
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
  const result = await withWrite(
    async (tx) =>
      await withLockedRulesetScope(tx, rulesetId, async (scope, policy) => await write(tx, scope, policy), {
        // The session's access, under the ruleset's lock, before its chain's locks and its view
        before: async () => (await getReadableRuleset(tx, session, rulesetId)).policy,
        reads,
      }),
    BUSY_RULESET_MESSAGE,
  );
  if (drops === "entities") RulesetViews.invalidateEntities(rulesetId);
  else RulesetViews.invalidate(rulesetId);
  return result;
}
