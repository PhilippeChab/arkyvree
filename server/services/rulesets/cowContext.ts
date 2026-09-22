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

const storage = new AsyncLocalStorage<CachedCowData | undefined>();

/**
 * Run `fn` inside a cowContext scoped to `cowData`. Passing `null` /
 * `undefined` clears the ambient context. An empty map is still a scope:
 * nested reads must never inherit a different ruleset's resolution map.
 *
 * @internal — Use `withRulesetScope` from `./cow.ts` from application code.
 */
export function withCowContext<T>(
  cowData: CachedCowData | null | undefined,
  fn: () => Promise<T>,
): Promise<T> {
  return storage.run(cowData ?? undefined, fn);
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
