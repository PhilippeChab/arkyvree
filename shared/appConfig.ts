/**
 * What the client reads at runtime (`window.__APP_CONFIG__`), filled into its shell by the server
 * (`server/routers/PageTemplates.ts`), or by Vite's dev server (`vite.config.ts`): a value that isn't set is null.
 */
export interface AppConfig {
  googleClientId: string | null;
  sentryDsn: string | null;
  sentryEnvironment: string | null;
  sentryRelease: string | null;
}
