import type { MiddlewareHandler } from "hono";

import { isTest } from "@/server/environment.ts";
import { getTimingStore, newTimingStore, timingStorage } from "@/server/timing.ts";

enum LogPrefix {
  Incoming = "<--",
  Outgoing = "-->",
}

function colorStatus(status: number): string {
  const s = status.toString();
  if (status >= 500) return `\x1b[31m${s}\x1b[0m`; // red
  if (status >= 400) return `\x1b[33m${s}\x1b[0m`; // yellow
  if (status >= 300) return `\x1b[36m${s}\x1b[0m`; // cyan
  if (status >= 200) return `\x1b[32m${s}\x1b[0m`; // green
  return s;
}

function log(prefix: LogPrefix, method: string, path: string, extra?: string): void {
  const ts = utcTimestamp();
  const msg = extra ? `[api] ${ts} ${prefix} ${method} ${path} ${extra}` : `[api] ${ts} ${prefix} ${method} ${path}`;
  console.log(msg);
}

/** A response's line, with what it cost (the request's timing store), and the slow queries it ran. */
function logOutgoing(method: string, path: string, statusCode: number, totalMs: number): void {
  const store = getTimingStore();
  const dbMs = store?.dbTimeMs ?? 0;
  const cpuMs = totalMs - dbMs;
  const queryCount = store?.queryCount ?? 0;

  const cacheHits = store?.cacheHits ?? 0;
  const cacheMisses = store?.cacheMisses ?? 0;
  const dedupHits = store?.dedupHits ?? 0;
  const dedupMisses = store?.dedupMisses ?? 0;

  const status = colorStatus(statusCode);
  const cacheInfo = cacheHits > 0 || cacheMisses > 0 ? ` cache: ${cacheHits}/${cacheHits + cacheMisses}` : "";
  const dedupInfo = dedupHits > 0 ? ` dedup: ${dedupHits}/${dedupHits + dedupMisses}` : "";
  const timing = `(db: ${Math.round(dbMs)}ms cpu: ${Math.round(cpuMs)}ms q: ${queryCount}${cacheInfo}${dedupInfo})`;

  log(LogPrefix.Outgoing, method, path, `${status} ${Math.round(totalMs)}ms ${timing}`);

  for (const q of store?.slowQueries ?? [])
    console.log(`[api] \x1b[33m    ⚠ ${Math.round(q.durationMs)}ms  ${q.sql}\x1b[0m`);
}

function utcTimestamp(): string {
  return new Date().toISOString();
}

/**
 * Times each request in a store of its own, which the queries and the error reports read, and logs it. A test run
 * prints none of it (`enabled`): thousands of lines that would bury its failures.
 */
export function requestLogger(enabled = !isTest()): MiddlewareHandler {
  return async (c, next) => {
    const method = c.req.method;
    const path = c.req.path;

    if (enabled) log(LogPrefix.Incoming, method, path);

    await timingStorage.run(newTimingStore(), async () => {
      const start = performance.now();
      await next();
      if (enabled) logOutgoing(method, path, c.res.status, performance.now() - start);
    });
  };
}
