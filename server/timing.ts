import { AsyncLocalStorage } from "node:async_hooks";
import { Client, Pool } from "pg";

interface TimingStore {
  dbTimeMs: number;
  queryCount: number;
  activeQueries: number;
  dbWallStart: number;
  slowQueries: { sql: string; durationMs: number }[];
  cacheHits: number;
  cacheMisses: number;
  dedupHits: number;
  dedupMisses: number;
}

const SLOW_QUERY_THRESHOLD_MS = 200;

export const timingStorage = new AsyncLocalStorage<TimingStore>();

export function getTimingStore(): TimingStore | undefined {
  return timingStorage.getStore();
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

function onQueryStart(): void {
  const store = timingStorage.getStore();
  if (!store) return;
  store.queryCount += 1;
  store.activeQueries += 1;
  if (store.activeQueries === 1) {
    store.dbWallStart = performance.now();
  }
}

function onQueryEnd(): void {
  const store = timingStorage.getStore();
  if (!store) return;
  store.activeQueries -= 1;
  if (store.activeQueries === 0) {
    store.dbTimeMs += performance.now() - store.dbWallStart;
  }
}

function trackSlowQuery(sql: string | undefined, queryStart: number): void {
  const durationMs = performance.now() - queryStart;
  if (durationMs < SLOW_QUERY_THRESHOLD_MS || !sql) return;
  const store = timingStorage.getStore();
  if (!store) return;
  store.slowQueries.push({ sql, durationMs });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function wrapPrototypeQuery(proto: { query: (...args: any[]) => any }): void {
  const original = proto.query;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  proto.query = function (this: any, ...args: any[]) {
    const result = original.apply(this, args);

    // Only measure when the result is a promise (no callback provided).
    // pool.query returns a Promise to the caller but internally uses
    // client.query(text, values, CALLBACK) which returns undefined —
    // so Client.prototype.query patch won't fire for pool-routed queries,
    // and Pool.prototype.query patch won't double-count transaction queries.
    if (result && typeof result.then === "function") {
      onQueryStart();
      const queryStart = performance.now();
      const sql = typeof args[0] === "string" ? args[0] : args[0]?.text;
      return (result as Promise<unknown>).then(
        (res) => { onQueryEnd(); trackSlowQuery(sql, queryStart); return res; },
        (err) => { onQueryEnd(); trackSlowQuery(sql, queryStart); throw err; },
      );
    }

    return result;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

let patched = false;

export function instrumentQueries(): void {
  if (patched) return;
  patched = true;

  // Pool.prototype.query — for regular (non-transaction) queries via drizzle
  wrapPrototypeQuery(Pool.prototype);

  // Client.prototype.query — for transaction queries where drizzle
  // holds a direct client from pool.connect()
  wrapPrototypeQuery(Client.prototype);
}
