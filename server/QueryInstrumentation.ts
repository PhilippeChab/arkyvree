import { Client, Pool } from "pg";

import { timingStorage } from "@/server/timing.ts";

const SLOW_QUERY_THRESHOLD_MS = 200;

function isThenable(value: unknown): value is Promise<unknown> {
  return typeof value === "object" && value !== null && "then" in value && typeof value.then === "function";
}

function onQueryEnd(): void {
  const store = timingStorage.getStore();
  if (!store) return;
  store.activeQueries -= 1;
  if (store.activeQueries === 0) {
    store.dbTimeMs += performance.now() - store.dbWallStart;
  }
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

/** The SQL text of a `query` call's first argument: a string, or a config with `text`. */
function queryText(arg: unknown): string | undefined {
  if (typeof arg === "string") return arg;
  if (typeof arg === "object" && arg !== null && "text" in arg && typeof arg.text === "string") return arg.text;
  return undefined;
}

function trackSlowQuery(sql: string | undefined, queryStart: number): void {
  const durationMs = performance.now() - queryStart;
  if (durationMs < SLOW_QUERY_THRESHOLD_MS || !sql) return;
  const store = timingStorage.getStore();
  if (!store) return;
  store.slowQueries.push({ sql, durationMs });
}

function wrapPrototypeQuery(proto: { query(...args: unknown[]): unknown }): void {
  const original = proto.query;

  proto.query = function (this: unknown, ...args: unknown[]) {
    const result = original.apply(this, args);

    // Only measure when the result is a promise (no callback provided).
    // pool.query returns a Promise to the caller but internally uses
    // client.query(text, values, CALLBACK) which returns undefined —
    // so Client.prototype.query patch won't fire for pool-routed queries,
    // and Pool.prototype.query patch won't double-count transaction queries.
    if (isThenable(result)) {
      onQueryStart();
      const queryStart = performance.now();
      const sql = queryText(args[0]);
      return result.then(
        (res) => {
          onQueryEnd();
          trackSlowQuery(sql, queryStart);
          return res;
        },
        (err) => {
          onQueryEnd();
          trackSlowQuery(sql, queryStart);
          throw err;
        },
      );
    }

    return result;
  };
}

/** pg's queries, timed into the request's store: its pool's and client's `query`, patched once however many pools ask. */
class QueryInstrumentation {
  private patched = false;

  instrument(): void {
    if (this.patched) return;
    this.patched = true;

    // Pool.prototype.query — for regular (non-transaction) queries via drizzle
    wrapPrototypeQuery(Pool.prototype);

    // Client.prototype.query — for transaction queries where drizzle
    // holds a direct client from pool.connect()
    wrapPrototypeQuery(Client.prototype);
  }
}

export default new QueryInstrumentation();
