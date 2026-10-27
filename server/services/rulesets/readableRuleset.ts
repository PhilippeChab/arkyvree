import type { Db } from "@/drizzle/database.ts";
import { type RulesetScope, withRulesetScope } from "@/server/cow/index.ts";
import { NotFoundError } from "@/server/errors/index.ts";
import { Rulesets } from "@/server/repositories/index.ts";
import { RulesetsPolicy } from "@/server/services/policies/index.ts";
import type { Session } from "@/shared/relations.ts";

/**
 * The ruleset `rulesetId` and the session's policy on it, if the session may read it (`RulesetsPolicy.canRead`), or the
 * 404 an unknown ruleset gets: what a read of a ruleset, or of what's under it, by its id starts with.
 */
export async function getReadableRuleset(db: Db, session: Session, rulesetId: string) {
  const ruleset = await Rulesets.findOne(db, { id: rulesetId });
  if (!ruleset) throw new NotFoundError("Ruleset not found");
  const policy = await RulesetsPolicy.for(db, session, ruleset);
  policy.canRead();
  return { policy, ruleset };
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
