import { type Db, withCowContext } from "@/server/database/index.ts";
import { NotFoundError } from "@/server/errors/index.ts";
import { Rulesets } from "@/server/repositories/index.ts";

import RulesetCache from "./RulesetCache.ts";
import type RulesetData from "./RulesetData.ts";

/**
 * Scope helper: loads the ruleset and its view (`RulesetCache.getData`), and runs `fn` inside a
 * cowContext so every repository read inside auto-resolves pre-COW ids to
 * post-COW (output Proxy) AND every entity-id WHERE-clause input is
 * auto-canonicalized (input Proxy). Services call this once at the top of
 * a character-scoped operation; downstream code stops caring about COW.
 *
 * Throws `NotFoundError("Ruleset not found")` if `rulesetId` doesn't exist,
 * so the callback always receives non-null `{ ruleset, rulesetData }` and
 * doesn't have to branch or add defensive sourceChain fallbacks.
 */
export async function withRulesetScope<T>(
  tx: Db,
  rulesetId: string,
  fn: (ctx: {
    ruleset: NonNullable<Awaited<ReturnType<typeof Rulesets.findOne>>>;
    rulesetData: RulesetData;
  }) => Promise<T>,
): Promise<T> {
  const ruleset = await Rulesets.findOne(tx, { id: rulesetId });
  if (!ruleset) throw new NotFoundError("Ruleset not found");
  const rulesetData = await RulesetCache.getData(ruleset);
  return await withCowContext(rulesetData.cow, () => fn({ ruleset, rulesetData }));
}

/**
 * Multi-ruleset variant: preload `rulesetData` for every unique id and hand
 * the map to `fn`. Used for list operations that enrich rows from many
 * rulesets at once (the characters and campaign characters lists) where a single
 * `cowContext` would have to pick one ruleset, excluding the others.
 *
 * No `cowContext` is activated — the composed `rulesetData.*` Maps already
 * resolve stored ids through their own ruleset's CowData, so lookups
 * work without ambient context. Services that need character-scoped repo
 * auto-resolution for a specific character should use `withRulesetScope`
 * inside their per-character enrichment path.
 *
 * Missing rulesets are silently skipped (rare: a character row referencing
 * a deleted ruleset); the map just won't have that key.
 */
export async function withRulesetScopes<T>(
  tx: Db,
  rulesetIds: Iterable<string>,
  fn: (rulesetDataByRulesetId: Map<string, RulesetData>) => Promise<T>,
): Promise<T> {
  const unique = [...new Set(rulesetIds)];
  const map = new Map<string, RulesetData>();
  for (const rulesetId of unique) {
    const ruleset = await Rulesets.findOne(tx, { id: rulesetId });
    if (!ruleset) continue;
    const rulesetData = await RulesetCache.getData(ruleset);
    map.set(rulesetId, rulesetData);
  }
  return fn(map);
}
