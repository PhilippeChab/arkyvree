/**
 * Request-scoped query deduplication.
 *
 * A request handler runs inside `runWithRequestCache`, which installs an
 * AsyncLocalStorage-backed Map used to coalesce duplicate reads within that
 * one request. Example: `Rulesets.findOne` gets called twice in the same
 * request — once in the service layer, once inside DetailedCharacterDataLoader.
 * The second call finds the first call's in-flight promise and piggybacks.
 *
 * Constraints:
 * - Only applies when the caller passes the global `db` (not a tx handle).
 *   Tx reads bypass the cache entirely — otherwise we could mix tx-visible
 *   uncommitted writes with non-tx reads from other async contexts.
 * - Writes clear the cache (inside `withTransaction` post-commit, plus any
 *   repo write method that somehow goes through global `db`). Without this,
 *   a pre-write read cached above, then a write, then a post-write read,
 *   would return stale data.
 * - The store dies with the request — zero cross-request leakage.
 */
import { AsyncLocalStorage } from "node:async_hooks";
import { onDedupHit, onDedupMiss } from "@/server/timing.ts";

const storage = new AsyncLocalStorage<Map<string, Promise<unknown>>>();

/** Run a request (or test) inside a fresh dedup cache. */
export function runWithRequestCache<T>(fn: () => Promise<T>): Promise<T> {
  return storage.run(new Map(), fn);
}

/**
 * Memoize a read by key for the current request. No-op when no cache is active
 * (e.g. tests that don't wrap themselves, boot-time warmers, background jobs).
 */
export function memoizeRequest<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const store = storage.getStore();
  if (!store) return fn();
  const existing = store.get(key);
  if (existing) {
    onDedupHit();
    return existing as Promise<T>;
  }
  onDedupMiss();
  const promise = fn();
  store.set(key, promise);
  // On failure, evict so a retry isn't permanently stuck on the rejected promise.
  promise.catch(() => {
    if (store.get(key) === promise) store.delete(key);
  });
  return promise;
}

/** Drop every entry. Called after a mutation commits to avoid stale reads. */
export function clearRequestCache(): void {
  const store = storage.getStore();
  store?.clear();
}
