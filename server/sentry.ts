import * as Sentry from "@sentry/bun";

import { getEnvironmentName, readEnv } from "@/server/environment.ts";
import { timingStorage } from "@/server/timing.ts";

/** Error reporting to Sentry (Better Stack's Sentry-compatible ingest), set up once per process. */
class ErrorReporting {
  private initialized = false;

  /**
   * Initializes Sentry from SENTRY_DSN. No-op if unset so dev/tests stay quiet. DSN points at Better Stack's
   * Sentry-compatible ingest endpoint.
   */
  init(component: "web" | "worker") {
    if (this.initialized) return;
    const dsn = readEnv("SENTRY_DSN");
    if (!dsn) return;

    Sentry.init({
      dsn,
      environment: getEnvironmentName(),
      release: readEnv("FLY_MACHINE_VERSION"),
      tracesSampleRate: Number(readEnv("SENTRY_TRACES_SAMPLE_RATE") || "0"),
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

    this.initialized = true;
  }
}

export default new ErrorReporting();

export { Sentry };
