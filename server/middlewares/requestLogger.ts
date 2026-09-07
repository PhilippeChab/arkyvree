import type { MiddlewareHandler } from "hono";

import { getTimingStore, timingStorage } from "@/server/timing.ts";

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

function utcTimestamp(): string {
  return new Date().toISOString();
}

function log(prefix: LogPrefix, method: string, path: string, extra?: string): void {
  const ts = utcTimestamp();
  const msg = extra
    ? `[api] ${ts} ${prefix} ${method} ${path} ${extra}`
    : `[api] ${ts} ${prefix} ${method} ${path}`;
  console.log(msg);
}

export function requestLogger(): MiddlewareHandler {
  return async (c, next) => {
    const method = c.req.method;
    const path = c.req.path;

    log(LogPrefix.Incoming, method, path);

    await timingStorage.run({ dbTimeMs: 0, queryCount: 0, activeQueries: 0, dbWallStart: 0, slowQueries: [], cacheHits: 0, cacheMisses: 0, dedupHits: 0, dedupMisses: 0 }, async () => {
      const start = performance.now();
      await next();

      const totalMs = performance.now() - start;
      const store = getTimingStore();
      const dbMs = store?.dbTimeMs ?? 0;
      const cpuMs = totalMs - dbMs;
      const queryCount = store?.queryCount ?? 0;

      const cacheHits = store?.cacheHits ?? 0;
      const cacheMisses = store?.cacheMisses ?? 0;
      const dedupHits = store?.dedupHits ?? 0;
      const dedupMisses = store?.dedupMisses ?? 0;

      const status = colorStatus(c.res.status);
      const cacheInfo = (cacheHits > 0 || cacheMisses > 0) ? ` cache: ${cacheHits}/${cacheHits + cacheMisses}` : "";
      const dedupInfo = (dedupHits > 0) ? ` dedup: ${dedupHits}/${dedupHits + dedupMisses}` : "";
      const timing = `(db: ${Math.round(dbMs)}ms cpu: ${Math.round(cpuMs)}ms q: ${queryCount}${cacheInfo}${dedupInfo})`;

      log(LogPrefix.Outgoing, method, path, `${status} ${Math.round(totalMs)}ms ${timing}`);

      if (store?.slowQueries.length) {
        for (const q of store.slowQueries) {
          console.log(`[api] \x1b[33m    ⚠ ${Math.round(q.durationMs)}ms  ${q.sql}\x1b[0m`);
        }
      }
    });
  };
}
