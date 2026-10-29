import type { Db } from "@/drizzle/database.ts";
import type { RulesetData, RulesetSources } from "@/engine/index.ts";
import { NotFoundError } from "@/server/errors/index.ts";
import { Rulesets } from "@/server/repositories/index.ts";

import RulesetViews from "./RulesetViews.ts";

/**
 * A ruleset, its sources and its view: what `withRulesetScope` hands its callback, and what an effect of the ruleset
 * runs in.
 */
export interface RulesetScope {
  ruleset: NonNullable<Awaited<ReturnType<typeof Rulesets.findOne>>>;
  rulesetData: RulesetData;
  sources: RulesetSources;
}

/** A ruleset's scope (`RulesetScope`), by its id, or none when it doesn't exist. */
async function readRulesetScope(tx: Db, rulesetId: string): Promise<RulesetScope | undefined> {
  const ruleset = await Rulesets.findOne(tx, { id: rulesetId });
  const sources = await Rulesets.findSources(tx, { id: rulesetId });
  if (!ruleset || !sources) return undefined;
  return { ruleset, rulesetData: await RulesetViews.getData(sources, ruleset.baseRules), sources };
}

/**
 * Runs `fn` with a ruleset, its sources (`Rulesets.findSources`) and its view (`RulesetViews.getData`): what the engine
 * answers in (`Engine.for(scope)`), what a write's copy-on-write reads by (`sources`), and what reads its stored rows
 * need of copy-on-write (`rulesetData.cow`: a list's filters, an id's equivalents). Nothing is ambient: a repository
 * reads rows as stored, and the engine reads them as the view does. Refuses a missing ruleset (`NotFoundError`), so
 * `fn` always has one.
 */
export async function withRulesetScope<T>(
  tx: Db,
  rulesetId: string,
  fn: (ctx: RulesetScope) => Promise<T>,
): Promise<T> {
  const scope = await readRulesetScope(tx, rulesetId);
  if (!scope) throw new NotFoundError("Ruleset not found");
  return await fn(scope);
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
    const scope = await readRulesetScope(tx, rulesetId);
    if (scope) map.set(rulesetId, scope);
  }
  return fn(map);
}
