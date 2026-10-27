import type { Db } from "@/drizzle/database.ts";
import { type RulesetScope, withRulesetScope } from "@/server/cow/index.ts";
import { NotFoundError } from "@/server/errors/index.ts";
import { Rulesets } from "@/server/repositories/index.ts";
import { RulesetsPolicy } from "@/server/services/policies/index.ts";
import type { Session } from "@/shared/relations.ts";

/** The ruleset `rulesetId` and the session's policy on it, or none when it doesn't exist. */
async function findRulesetPolicy(db: Db, session: Session, rulesetId: string) {
  const ruleset = await Rulesets.findOne(db, { id: rulesetId });
  if (!ruleset) return undefined;
  return { policy: await RulesetsPolicy.for(db, session, ruleset), ruleset };
}

/**
 * The ruleset `rulesetId` and the session's policy on it, if the session may read it (`RulesetsPolicy.isReadable`), or
 * none, as for a ruleset that doesn't exist: what links to a ruleset, rather than reads it, asks.
 */
export async function findReadableRuleset(db: Db, session: Session, rulesetId: string) {
  const found = await findRulesetPolicy(db, session, rulesetId);
  return found?.policy.isReadable() ? found : undefined;
}

/**
 * The ruleset `rulesetId` and the session's policy on it, if the session may read it (`RulesetsPolicy.canRead`), or the
 * 404 an unknown ruleset gets: what a read of a ruleset, or of what's under it, by its id starts with.
 */
export async function getReadableRuleset(db: Db, session: Session, rulesetId: string) {
  const found = await findRulesetPolicy(db, session, rulesetId);
  if (!found) throw new NotFoundError("Ruleset not found");
  found.policy.canRead();
  return found;
}

/**
 * Runs `fn` in the scope of the ruleset `rulesetId` (`withRulesetScope`), if the session may read it
 * (`getReadableRuleset`): a read of what's under a ruleset by its id. A write checks its own rights instead, and a
 * character's reads its character's.
 */
export async function withReadableRuleset<T>(
  db: Db,
  session: Session,
  rulesetId: string,
  fn: (scope: RulesetScope) => Promise<T>,
): Promise<T> {
  await getReadableRuleset(db, session, rulesetId);
  return await withRulesetScope(db, rulesetId, fn);
}
