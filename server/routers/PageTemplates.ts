import { readEnv } from "@/server/environment.ts";
import type { AppConfig } from "@/shared/appConfig.ts";

/** What the client reads at runtime, filled into its shell. */
const APP_CONFIG = JSON.stringify({
  googleClientId: readEnv("GOOGLE_CLIENT_ID") || null,
  sentryDsn: readEnv("SENTRY_CLIENT_DSN") || null,
  sentryEnvironment: readEnv("NODE_ENV") || null,
  sentryRelease: readEnv("FLY_MACHINE_VERSION") || null,
} satisfies AppConfig);

/** The app's public URL, which the pages' links and meta name. */
export const APP_URL = readEnv("APP_URL") || "http://localhost:8000";

/** The HTML page the static router fills in, read from disk once and kept: the app's shell. */
class PageTemplates {
  private template: string | null = null;

  /** The app's shell (`dist/index.html`), its runtime config filled in. */
  async getTemplate(): Promise<string> {
    if (this.template) return this.template;
    const file = Bun.file("./dist/index.html");
    const raw = await file.text();
    this.template = raw.replace("__APP_CONFIG_JSON__", APP_CONFIG);
    return this.template;
  }
}

export default new PageTemplates();
