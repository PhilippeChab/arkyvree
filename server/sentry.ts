import * as Sentry from "@sentry/bun";

import { timingStorage } from "@/server/timing.ts";

let initialized = false;

// Initializes Sentry from SENTRY_DSN. No-op if unset so dev/tests stay quiet.
// DSN points at Better Stack's Sentry-compatible ingest endpoint.
export function initSentry(component: "web" | "worker") {
  if (initialized) return;
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) return;

  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV || "development",
    release: process.env.FLY_MACHINE_VERSION,
    tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE || "0"),
    sendDefaultPii: false,
    // Disable Sentry's default unhandled-rejection capture so the handler
    // below can attach request-scope context (whether the rejection
    // originated inside a Hono handler, the request's active query count,
    // etc.) — useful when the bun-compiled binary stack alone is opaque.
    integrations: (defaults) => defaults.filter((i) => i.name !== "OnUnhandledRejection"),
  });
  Sentry.setTag("component", component);

  process.on("unhandledRejection", (reason) => {
    const timing = timingStorage.getStore();
    Sentry.captureException(reason, {
      originalException: reason,
      mechanism: { handled: false, type: "auto.node.onunhandledrejection" },
      captureContext: {
        tags: { in_request: timing ? "yes" : "no" },
        extra: timing
          ? {
              queryCount: timing.queryCount,
              activeQueries: timing.activeQueries,
              dbTimeMs: timing.dbTimeMs,
              cacheHits: timing.cacheHits,
              cacheMisses: timing.cacheMisses,
              slowQueries: timing.slowQueries.slice(0, 5),
            }
          : { unhandledPromiseRejection: true },
      },
    });
    console.error("[unhandledRejection]", reason);
  });

  initialized = true;
}

export { Sentry };
