/** The HTML pages the static router fills in, read from disk once and kept: the landing page and the app's shell. */
export default class PageTemplates {
  constructor(appUrl: string, appConfig: string) {
    this.appUrl = appUrl;
    this.appConfig = appConfig;
  }

  private readonly appUrl: string;

  private readonly appConfig: string;

  private landing: string | null = null;

  private template: string | null = null;

  /** The landing page, its app URL filled in. */
  async getLanding(): Promise<string> {
    if (this.landing) return this.landing;
    const file = Bun.file("./server/landing.html");
    const raw = await file.text();
    this.landing = raw.replaceAll("__APP_URL__", this.appUrl);
    return this.landing;
  }

  /** The app's shell (`dist/index.html`), its runtime config filled in. */
  async getTemplate(): Promise<string> {
    if (this.template) return this.template;
    const file = Bun.file("./dist/index.html");
    const raw = await file.text();
    this.template = raw.replace("__APP_CONFIG_JSON__", this.appConfig);
    return this.template;
  }
}
