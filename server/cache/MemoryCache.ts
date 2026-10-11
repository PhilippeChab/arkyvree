import { readEnv } from "@/server/environment.ts";
import { onCacheHit, onCacheMiss } from "@/server/timing.ts";

interface CacheEntry<T> {
  expiresAt: number;
  value: T;
}

const SWEEP_INTERVAL_MS = 60 * 1000;

const TTL_MS = 5 * 60 * 1000;

/** The most entries a cache keeps: a new one evicts the unpinned entry that expires first. */
export const MAX_ENTRIES = 200;

/**
 * A bounded in-memory store: an entry expires after five minutes, unless pinned, and a timer sweeps the expired ones
 * out every minute.
 */
export default class MemoryCache<T> {
  constructor() {
    // Don't keep the process alive just for cache sweeping
    setInterval(() => this.sweep(), SWEEP_INTERVAL_MS).unref();
  }

  /** Whether every cache keeps what it's given: off with DISABLE_CACHE, and in the worker (`setEnabled`). */
  private static enabled = readEnv("DISABLE_CACHE") !== "true";

  /** Whether every cache keeps what it's given. */
  static isEnabled(): boolean {
    return MemoryCache.enabled;
  }

  /** Turns every cache on or off: the worker reads committed rows each time, the tests compare both. */
  static setEnabled(enabled: boolean): void {
    MemoryCache.enabled = enabled;
  }

  private readonly pinned = new Set<string>();

  private readonly store = new Map<string, CacheEntry<T>>();

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

    if (oldestKey) this.store.delete(oldestKey);
  }

  private invalidate(key: string): void {
    this.store.delete(key);
    this.pinned.delete(key);
  }

  /** Remove all expired entries. Called automatically by the sweep timer. */
  private sweep(): void {
    const now = Date.now();
    for (const [key, entry] of this.store) if (now > entry.expiresAt && !this.pinned.has(key)) this.store.delete(key);
  }

  get(key: string): T | undefined {
    if (!MemoryCache.enabled) {
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

  invalidateAll(): void {
    this.store.clear();
    this.pinned.clear();
  }

  invalidateWhere(matches: (value: T) => boolean): void {
    for (const [key, entry] of this.store) if (matches(entry.value)) this.invalidate(key);
  }

  isPinned(key: string): boolean {
    return this.pinned.has(key);
  }

  pin(key: string): void {
    this.pinned.add(key);
  }

  /** Keeps `value` for `ttl` milliseconds (five minutes by default; the tests expire entries at once). */
  set(key: string, value: T, ttl = TTL_MS): void {
    if (!MemoryCache.enabled) return;
    // If at capacity and this is a new key, evict the oldest unpinned entry.
    // If eviction fails (everything is pinned), skip the insert to prevent
    // unbounded growth past MAX_ENTRIES.
    if (!this.store.has(key) && this.store.size >= MAX_ENTRIES) {
      const sizeBefore = this.store.size;
      this.evictOldest();
      if (this.store.size === sizeBefore) return;
    }

    this.store.set(key, { value, expiresAt: Date.now() + ttl });
  }
}
