/**
 * @file AsyncLocalStorage-backed COW context.
 *
 * **Infrastructure — do not import from services or ruleset code.**
 *
 * This file is part of the COW auto-resolution machinery:
 * - `withCowContext` is wrapped by `withRulesetScope` (the public entry).
 * - `currentCowContext` is read by the repo Proxy + `BaseRepository.idMatches`.
 *
 * Services should use `withRulesetScope` / `withRulesetScopes` from
 * `./cow.ts` instead. Importing from this file directly bypasses the
 * rulesetData loading / invariant checking that the scope helpers provide.
 *
 * The async-local store dies with the callback — zero cross-request leakage.
 */
import { AsyncLocalStorage } from "node:async_hooks";
import type { CachedCowData } from "@/server/cache/index.ts";

const storage = new AsyncLocalStorage<CachedCowData>();

/**
 * Run `fn` inside a cowContext scoped to `cowData`. Passing `null` /
 * `undefined` / an empty overrideMap is a no-op — `fn` runs in the
 * ambient context (useful so call sites don't have to branch on whether
 * cowData is available).
 *
 * @internal — Use `withRulesetScope` from `./cow.ts` from application code.
 */
export function withCowContext<T>(
  cowData: CachedCowData | null | undefined,
  fn: () => Promise<T>,
): Promise<T> {
  if (!cowData || cowData.idResolveMap.size === 0) return fn();
  return storage.run(cowData, fn);
}

/**
 * The currently active cowData, or `undefined` outside any wrapper.
 *
 * @internal — Read by the repo Proxy / `BaseRepository.idMatches`. Service
 * code should read values off `rulesetData.cow` (from `withRulesetScope`)
 * instead — it's the same data with stronger typing and non-null contract.
 */
export function currentCowContext(): CachedCowData | undefined {
  return storage.getStore();
}
