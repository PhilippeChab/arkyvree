import * as Sentry from "@sentry/react";

let initialized = false;

/**
 * Initializes the browser Sentry SDK from the server-injected APP_CONFIG. The DSN is read at runtime (not via
 * build-time VITE_*) so the same bundle works across environments — see server/routers/static.ts.
 */
export function initSentry() {
  if (initialized) return;
  const { sentryDsn: dsn, sentryEnvironment, sentryRelease } = window.__APP_CONFIG__;
  if (!dsn) return;

  Sentry.init({
    dsn,
    environment: sentryEnvironment ?? undefined,
    release: sentryRelease ?? undefined,
    sendDefaultPii: false,
  });
  initialized = true;
}
