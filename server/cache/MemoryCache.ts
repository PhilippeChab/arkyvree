import { onCacheHit, onCacheMiss } from "@/server/timing.ts";

const DEFAULT_TTL_MS = 5 * 60 * 1000; // 5 minutes
const DEFAULT_SWEEP_INTERVAL_MS = 60 * 1000; // 1 minute
const DEFAULT_MAX_SIZE = 200;

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

interface MemoryCacheOptions {
  defaultTtl?: number;
  maxSize?: number;
  sweepInterval?: number;
}

let globalCacheEnabled = process.env.DISABLE_CACHE !== "true";

export function setCacheEnabled(enabled: boolean): void {
  globalCacheEnabled = enabled;
}

export function isCacheEnabled(): boolean {
  return globalCacheEnabled;
}

export default class MemoryCache<T> {
  private store = new Map<string, CacheEntry<T>>();
  private pinned = new Set<string>();
  private defaultTtl: number;
  private maxSize: number;
  private sweepTimer: ReturnType<typeof setInterval> | null = null;

  constructor(options: MemoryCacheOptions | number = {}) {
    // Support legacy signature: new MemoryCache(ttlMs)
    if (typeof options === "number") {
      this.defaultTtl = options;
      this.maxSize = DEFAULT_MAX_SIZE;
    } else {
      this.defaultTtl = options.defaultTtl ?? DEFAULT_TTL_MS;
      this.maxSize = options.maxSize ?? DEFAULT_MAX_SIZE;
    }

    const interval = typeof options === "number" ? DEFAULT_SWEEP_INTERVAL_MS : (options.sweepInterval ?? DEFAULT_SWEEP_INTERVAL_MS);
    this.sweepTimer = setInterval(() => this.sweep(), interval);
    // Don't keep the process alive just for cache sweeping
    if (typeof this.sweepTimer === "object" && "unref" in this.sweepTimer) {
      this.sweepTimer.unref();
    }
  }

  get(key: string): T | undefined {
    if (!globalCacheEnabled) {
      onCacheMiss();
      return undefined;
    }

    const entry = this.store.get(key);
    if (!entry) {
      onCacheMiss();
      return undefined;
    }

    if (Date.now() > entry.expiresAt && !this.pinned.has(key)) {
      this.store.delete(key);
      onCacheMiss();
      return undefined;
    }

    onCacheHit();
    return entry.value;
  }

  set(key: string, value: T, ttl?: number): void {
    if (!globalCacheEnabled) return;
    // If at capacity and this is a new key, evict the oldest unpinned entry.
    // If eviction fails (everything is pinned), skip the insert to prevent
    // unbounded growth past maxSize.
    if (!this.store.has(key) && this.store.size >= this.maxSize) {
      const sizeBefore = this.store.size;
      this.evictOldest();
      if (this.store.size === sizeBefore) return;
    }

    this.store.set(key, {
      value,
      expiresAt: Date.now() + (ttl ?? this.defaultTtl),
    });
  }

  invalidate(key: string): void {
    this.store.delete(key);
    this.pinned.delete(key);
  }

  invalidateByPrefix(prefix: string): void {
    for (const key of this.store.keys()) {
      if (key.startsWith(prefix)) {
        this.store.delete(key);
        this.pinned.delete(key);
      }
    }
  }

  invalidateAll(): void {
    this.store.clear();
    this.pinned.clear();
  }

  pin(key: string): void {
    this.pinned.add(key);
  }

  unpin(key: string): void {
    this.pinned.delete(key);
  }

  isPinned(key: string): boolean {
    return this.pinned.has(key);
  }

  /** Remove all expired entries. Called automatically by the sweep timer. */
  private sweep(): void {
    const now = Date.now();
    for (const [key, entry] of this.store) {
      if (now > entry.expiresAt && !this.pinned.has(key)) {
        this.store.delete(key);
      }
    }
  }

  /** Evict the entry with the earliest expiration (oldest). Pinned entries are skipped. */
  private evictOldest(): void {
    let oldestKey: string | null = null;
    let oldestExpiry = Infinity;

    for (const [key, entry] of this.store) {
      if (this.pinned.has(key)) continue;
      if (entry.expiresAt < oldestExpiry) {
        oldestExpiry = entry.expiresAt;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this.store.delete(oldestKey);
    }
  }
}
