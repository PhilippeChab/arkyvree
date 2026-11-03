import type { AppConfig } from "@/shared/appConfig.ts";

declare global {
  interface Window {
    /** The runtime config the app's shell carries (`client/index.html`), which the server fills in. */
    __APP_CONFIG__: AppConfig;
  }
}
