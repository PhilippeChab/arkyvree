import * as Sentry from "@sentry/react";

let initialized = false;

// Initializes the browser Sentry SDK from the server-injected APP_CONFIG. The
// DSN is read at runtime (not via build-time VITE_*) so the same bundle works
// across environments — see server/routers/static.ts.
export function initSentry() {
  if (initialized) return;
  const cfg = window.__APP_CONFIG__;
  const dsn = cfg?.sentryDsn;
  if (!dsn) return;

  Sentry.init({
    dsn,
    environment: cfg?.sentryEnvironment || undefined,
    release: cfg?.sentryRelease || undefined,
    sendDefaultPii: false,
  });
  initialized = true;
}

export { Sentry };
