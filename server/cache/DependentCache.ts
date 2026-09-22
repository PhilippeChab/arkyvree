import MemoryCache, { isCacheEnabled } from "./MemoryCache.ts";

interface Loaded<T> {
  data: T;
  pinned?: boolean;
}

/** Bounded cached entries plus in-flight reads, invalidated by dependency ID. */
export default class DependentCache<T> {
  private cache = new MemoryCache<{ data: T; dependencies: ReadonlySet<string> }>();
  private pending = new Map<string, { promise: Promise<T>; dependencies: ReadonlySet<string> }>();

  async getOrFetch(key: string, dependencyIds: readonly string[], fetcher: () => Promise<Loaded<T>>): Promise<T> {
    if (!isCacheEnabled()) {
      return (await fetcher()).data;
    }
    const cached = this.cache.get(key);
    if (cached) return cached.data;
    const active = this.pending.get(key);
    if (active) return active.promise;

    const dependencies = new Set(dependencyIds);
    // Register before invoking the loader, including loaders that throw before
    // their first await. Promise identity is the generation token for this key.
    const promise: Promise<T> = Promise.resolve().then(fetcher).then(({ data, pinned }) => {
      if (this.pending.get(key)?.promise === promise) {
        this.cache.set(key, { data, dependencies });
        if (pinned) this.cache.pin(key);
      }
      return data;
    }).finally(() => {
      if (this.pending.get(key)?.promise === promise) this.pending.delete(key);
    });
    this.pending.set(key, { promise, dependencies });
    return promise;
  }

  invalidate(dependencyId: string): void {
    // MemoryCache is capped at 200 entries. No unbounded dependency registry,
    // no database lookup, and unrelated cached/in-flight reads stay reusable.
    this.cache.invalidateWhere(entry => entry.dependencies.has(dependencyId));
    for (const [key, entry] of this.pending) {
      if (entry.dependencies.has(dependencyId)) this.pending.delete(key);
    }
  }

  invalidateAll(): void {
    this.cache.invalidateAll();
    this.pending.clear();
  }

  isPinned(key: string): boolean {
    return this.cache.isPinned(key);
  }
}
