import type { RulesetData } from "@/engine/index.ts";
import type { Db } from "@/server/database/index.ts";
import { NotFoundError } from "@/server/errors/index.ts";
import { Rulesets } from "@/server/repositories/index.ts";

import RulesetViews from "./RulesetViews.ts";

/** A ruleset and its view: what `withRulesetScope` hands its callback, and what an effect of the ruleset runs in. */
export interface RulesetScope {
  ruleset: NonNullable<Awaited<ReturnType<typeof Rulesets.findOne>>>;
  rulesetData: RulesetData;
}

/**
 * Runs `fn` with a ruleset and its view (`RulesetViews.getData`): what the engine answers in (`Engine.for(scope)`), and
 * what reads its stored rows need of copy-on-write (`rulesetData.cow`: a list's filters, an id's equivalents). Nothing
 * is ambient: a repository reads rows as stored, and the engine reads them as the view does. Refuses a missing ruleset
 * (`NotFoundError`), so `fn` always has one.
 */
export async function withRulesetScope<T>(
  tx: Db,
  rulesetId: string,
  fn: (ctx: RulesetScope) => Promise<T>,
): Promise<T> {
  const ruleset = await Rulesets.findOne(tx, { id: rulesetId });
  if (!ruleset) throw new NotFoundError("Ruleset not found");
  const rulesetData = await RulesetViews.getData(ruleset);
  return await fn({ ruleset, rulesetData });
}

/**
 * Runs `fn` with the views of several rulesets (each id once), by id: a list of rows from many rulesets (the characters
 * and campaign characters lists), each described in its own ruleset's view. A missing ruleset (a character's deleted
 * one) is left out of the map.
 */
export async function withRulesetScopes<T>(
  tx: Db,
  rulesetIds: Iterable<string>,
  fn: (viewsByRulesetId: Map<string, RulesetScope>) => Promise<T>,
): Promise<T> {
  const unique = [...new Set(rulesetIds)];
  const map = new Map<string, RulesetScope>();
  for (const rulesetId of unique) {
    const ruleset = await Rulesets.findOne(tx, { id: rulesetId });
    if (!ruleset) continue;
    map.set(rulesetId, { ruleset, rulesetData: await RulesetViews.getData(ruleset) });
  }
  return fn(map);
}
