import { AsyncLocalStorage } from "node:async_hooks";

export interface TimingStore {
  activeQueries: number;
  cacheHits: number;
  cacheMisses: number;
  dbTimeMs: number;
  dbWallStart: number;
  dedupHits: number;
  dedupMisses: number;
  queryCount: number;
  slowQueries: { durationMs: number; sql: string }[];
}

export const timingStorage = new AsyncLocalStorage<TimingStore>();

export function getTimingStore(): TimingStore | undefined {
  return timingStorage.getStore();
}

/** A request's counters, each at zero: what `timingStorage.run` counts into. */
export function newTimingStore(): TimingStore {
  return {
    dbTimeMs: 0,
    queryCount: 0,
    activeQueries: 0,
    dbWallStart: 0,
    slowQueries: [],
    cacheHits: 0,
    cacheMisses: 0,
    dedupHits: 0,
    dedupMisses: 0,
  };
}

export function onCacheHit(): void {
  const store = timingStorage.getStore();
  if (!store) return;
  store.cacheHits += 1;
}

export function onCacheMiss(): void {
  const store = timingStorage.getStore();
  if (!store) return;
  store.cacheMisses += 1;
}

export function onDedupHit(): void {
  const store = timingStorage.getStore();
  if (!store) return;
  store.dedupHits += 1;
}

export function onDedupMiss(): void {
  const store = timingStorage.getStore();
  if (!store) return;
  store.dedupMisses += 1;
}
