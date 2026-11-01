import { runWithRequestCache } from "@/server/database/index.ts";

import MemoryCache from "./MemoryCache.ts";

interface Loaded<T> {
  data: T;
  pinned?: boolean;
}

/** Bounded cached entries plus in-flight reads, invalidated by dependency ID. */
export default class DependentCache<T> {
  private readonly cache = new MemoryCache<{ data: T; dependencies: ReadonlySet<string> }>();

  private readonly pending = new Map<string, { dependencies: ReadonlySet<string>; promise: Promise<T> }>();

  /** A fresh read's own fill of `key`, kept in its place for every reader. */
  private async fill(key: string, dependencyIds: readonly string[], fetcher: () => Promise<Loaded<T>>): Promise<T> {
    const { data, pinned } = await fetcher();
    this.cache.set(key, { data, dependencies: new Set(dependencyIds) });
    if (pinned) this.cache.pin(key);
    return data;
  }

  invalidate(dependencyId: string): void {
    // MemoryCache is capped at 200 entries. No unbounded dependency registry,
    // no database lookup, and unrelated cached/in-flight reads stay reusable.
    this.cache.invalidateWhere((entry) => entry.dependencies.has(dependencyId));
    for (const [key, entry] of this.pending) if (entry.dependencies.has(dependencyId)) this.pending.delete(key);
  }

  invalidateAll(): void {
    this.cache.invalidateAll();
    this.pending.clear();
  }

  /**
   * The entry of `key`: the cached one, else the one a fill in flight reads, else one `fetcher` reads, kept for every
   * reader under its dependencies. Given `accepts`, a fresh read's (a write's, under its lock): the cached entry when
   * it accepts it, else its own fill, never one in flight (which read before the write's lock), kept in its place.
   */
  async getOrFetch(
    key: string,
    dependencyIds: readonly string[],
    fetcher: () => Promise<Loaded<T>>,
    accepts?: (data: T) => boolean,
  ): Promise<T> {
    if (!MemoryCache.isEnabled()) return (await fetcher()).data;

    const cached = this.cache.get(key);
    if (cached && (!accepts || accepts(cached.data))) return cached.data;
    if (accepts) return await this.fill(key, dependencyIds, fetcher);
    const active = this.pending.get(key);
    if (active) return active.promise;

    const dependencies = new Set(dependencyIds);
    // Register before invoking the loader, including loaders that throw before
    // their first await. Promise identity is the generation token for this key.
    // A caller may have read before another request invalidated this entry.
    // Never promote its old repository promises back into a shared cache.
    // Keep deduplication within the fill, including concurrent reads it starts.
    const promise: Promise<T> = Promise.resolve()
      .then(() => runWithRequestCache(fetcher))
      .then(({ data, pinned }) => {
        if (this.pending.get(key)?.promise === promise) {
          this.cache.set(key, { data, dependencies });
          if (pinned) this.cache.pin(key);
        }
        return data;
      })
      .finally(() => {
        if (this.pending.get(key)?.promise === promise) this.pending.delete(key);
      });
    this.pending.set(key, { promise, dependencies });
    return promise;
  }
}
