import * as Sentry from "@sentry/react";

/**
 * Initializes the browser Sentry SDK from the server-injected APP_CONFIG, once, as the app starts (`main.tsx`). The DSN
 * is read at runtime (not via build-time VITE_*) so the same bundle works across environments — see
 * server/routers/PageTemplates.ts.
 */
export function initSentry() {
  const { sentryDsn: dsn, sentryEnvironment, sentryRelease } = window.__APP_CONFIG__;
  if (!dsn) return;

  Sentry.init({
    dsn,
    environment: sentryEnvironment ?? undefined,
    release: sentryRelease ?? undefined,
    sendDefaultPii: false,
  });
}
