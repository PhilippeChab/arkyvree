/**
 * @file AsyncLocalStorage-backed COW context.
 *
 * **Infrastructure — do not import from services or ruleset code.**
 *
 * This file is part of the COW auto-resolution machinery:
 * - `withCowContext` is wrapped by `withRulesetScope` (the public entry).
 * - `getCowContext` is read by the repo Proxy + `idMatches` (`ResolvesCopies`).
 *
 * Services should use `withRulesetScope` / `withRulesetScopes` from `server/cache/rulesetCache/` instead. Importing
 * from this file directly bypasses the rulesetData loading / invariant checking that the scope helpers provide.
 *
 * The async-local store dies with the callback — zero cross-request leakage.
 */

import { AsyncLocalStorage } from "node:async_hooks";

/**
 * Branded `Map<string, string>` carrying compose-skip semantic. Keys are
 * source-entity IDs of true COW overrides — read by `compose()` to drop
 * the source row when a child has overridden it. The brand stops it being
 * passed where an `IdResolveMap` is expected (or vice versa). Construct via
 * `newOverrideMap()` only.
 */
export type OverrideMap = Map<string, string> & { readonly __brand: "OverrideMap" };

/**
 * Branded `Map<string, string>` carrying id-canonicalize semantic. Maps any
 * "stale" id (true override source, aptitude name-grouping loser, snapshot
 * sibling loser) to its canonical winner. Read by the repo Proxy
 * (`canonicalizeArgs`, `resolveRowOverrides`), `idMatches` (`ResolvesCopies`),
 * `cowResolvingMap`, and `resolveOverrides`. Construct via
 * `newIdResolveMap(seed?)` only.
 */
export type IdResolveMap = Map<string, string> & { readonly __brand: "IdResolveMap" };

/** A ruleset's copy-on-write state: what a scope's reads resolve ids through. */
export interface CowData {
  sourceChain: string[];
  /** Compose-skip semantic — see {@link OverrideMap}. */
  overrideMap: OverrideMap;
  /** ID-canonicalize semantic — see {@link IdResolveMap}. Superset of `overrideMap`. */
  idResolveMap: IdResolveMap;
  /** Maps a winning COW'd entity ID → sibling-loser COW'd entity IDs */
  siblingMap: Map<string, string[]>;
  /** Flattened set of every sibling ID, precomputed from siblingMap */
  siblingIds: Set<string>;
}

const storage = new AsyncLocalStorage<CowData | undefined>();

/**
 * The currently active cowData, or `undefined` outside any wrapper.
 *
 * @internal — Read by the repo Proxy, `idMatches` (`ResolvesCopies`) and an entity list's sibling losers
 * (`ScopesToRuleset`). Service code should read values off `rulesetData.cow` (from `withRulesetScope`) instead — it's
 * the same data with stronger typing and non-null contract.
 */
export function getCowContext(): CowData | undefined {
  return storage.getStore();
}

/**
 * Run `fn` inside a cowContext scoped to `cowData`. Passing `null` /
 * `undefined` clears the ambient context. An empty map is still a scope:
 * nested reads must never inherit a different ruleset's resolution map.
 *
 * @internal — Use `withRulesetScope` from `server/cache/rulesetCache/` from application code.
 */
export function withCowContext<T>(cowData: CowData | null | undefined, fn: () => Promise<T>): Promise<T> {
  return storage.run(cowData ?? undefined, fn);
}
