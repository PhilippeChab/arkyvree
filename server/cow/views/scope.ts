import type { Db } from "@/drizzle/database.ts";
import type { RulesetData, RulesetSources } from "@/engine/index.ts";
import { NotFoundError } from "@/server/errors/index.ts";
import { Rulesets } from "@/server/repositories/index.ts";

import RulesetViews from "./RulesetViews.ts";

/**
 * A ruleset's scope as a write holds it, under its lock (`withLockedRulesetScope`): the ruleset's row locked, its
 * source chain's shared, its view fresh, read at the content versions its locks read (`versions`, committed: the
 * ruleset's own before the write). Only `withLockedRulesetScope` makes one: copy-on-write's writes take nothing else.
 */
export interface LockedRulesetScope extends RulesetScope {
  readonly [LOCKED]: true;
  versions: ReadonlyMap<string, number>;
}

/**
 * A ruleset, its sources and its view: what `withRulesetScope` hands its callback, and what an effect of the ruleset
 * runs in.
 */
export interface RulesetScope {
  ruleset: NonNullable<Awaited<ReturnType<typeof Rulesets.findOne>>>;
  rulesetData: RulesetData;
  sources: RulesetSources;
}

/** What only a locked scope holds: no other value has it, so no scope reads as locked but one its lock made. */
declare const LOCKED: unique symbol;

/** A ruleset's scope (`RulesetScope`), by its id, or none when it doesn't exist. */
async function readRulesetScope(tx: Db, rulesetId: string): Promise<RulesetScope | undefined> {
  const ruleset = await Rulesets.findOne(tx, { id: rulesetId });
  const sources = await Rulesets.findSources(tx, { id: rulesetId });
  if (!ruleset || !sources) return undefined;
  return { ruleset, rulesetData: await RulesetViews.getData(sources, ruleset.baseRules), sources };
}

/**
 * Runs `fn` in a ruleset's scope as a write holds it (`LockedRulesetScope`), in the write's transaction (`tx`), its
 * locks taken before it reads anything of the ruleset: the ruleset's row first, its content version bumped
 * (`Rulesets.lockContent`), then its row, its sources and its source chain's rows, shared, in the order every lock of
 * several takes (`Rulesets.lockVersions`), then its view, fresh at the versions they read
 * (`RulesetViews.getFreshData`). Its chain can't change while it holds them: only a write of the ruleset subscribes it.
 * What runs before its chain's locks and its view (`before`: the session's access, which refuses a write before it
 * costs more, its answer handed to `fn`) runs under the ruleset's lock alone; what else it reads of other rulesets
 * (`reads`: the extensions a subscribe adds) is locked with its chain, alike. Refuses a missing ruleset
 * (`NotFoundError`). The locks end with the transaction.
 */
export async function withLockedRulesetScope<T, B = undefined>(
  tx: Db,
  rulesetId: string,
  fn: (scope: LockedRulesetScope, checked: B) => Promise<T>,
  { before, reads = [] }: { before?: () => Promise<B>; reads?: readonly string[] } = {},
): Promise<T> {
  const committed = await Rulesets.lockContent(tx, { id: rulesetId });
  const ruleset = committed === undefined ? undefined : await Rulesets.findOne(tx, { id: rulesetId });
  const sources = ruleset && (await Rulesets.findSources(tx, { id: rulesetId }));
  if (committed === undefined || !ruleset || !sources) throw new NotFoundError("Ruleset not found");
  const checked = (await before?.()) as B;
  const chain = await Rulesets.lockVersions(tx, {
    ids: [...new Set([...sources.extensionIds, ...(sources.parentId ? [sources.parentId] : []), ...reads])],
  });
  const versions = new Map([[rulesetId, committed], ...chain]);
  const rulesetData = await RulesetViews.getFreshData(tx, sources, ruleset.baseRules, versions);
  return await fn({ ruleset, rulesetData, sources, versions } as unknown as LockedRulesetScope, checked);
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

/**
 * Runs `fn` in a ruleset's scope as a write that reads the ruleset holds it (a character's), in the write's transaction
 * (`tx`): the ruleset's row shared first, then its source chain's, in the order every lock of several takes
 * (`Rulesets.lockVersions`), so no write of theirs runs meanwhile while other such writes run alongside, then its view,
 * fresh at the versions they read (`RulesetViews.getFreshData`). Their content versions stay as they are: nothing of
 * the ruleset's view changes. What runs after its chain's locks and before its view (`before`: the write's own row's
 * lock and the session's access, its answer handed to `fn`) runs under them, so a refused write reads no view. Refuses
 * a missing ruleset (`NotFoundError`). The locks end with the transaction.
 */
export async function withSharedRulesetScope<T, B = undefined>(
  tx: Db,
  rulesetId: string,
  fn: (scope: RulesetScope, checked: B) => Promise<T>,
  { before }: { before?: () => Promise<B> } = {},
): Promise<T> {
  const own = await Rulesets.lockVersions(tx, { ids: [rulesetId] });
  const ruleset = own.has(rulesetId) ? await Rulesets.findOne(tx, { id: rulesetId }) : undefined;
  const sources = ruleset && (await Rulesets.findSources(tx, { id: rulesetId }));
  if (!ruleset || !sources) throw new NotFoundError("Ruleset not found");
  const chain = await Rulesets.lockVersions(tx, {
    ids: [...new Set([...sources.extensionIds, ...(sources.parentId ? [sources.parentId] : [])])],
  });
  const checked = (await before?.()) as B;
  const versions = new Map([...own, ...chain]);
  const rulesetData = await RulesetViews.getFreshData(tx, sources, ruleset.baseRules, versions);
  return await fn({ ruleset, rulesetData, sources }, checked);
}
