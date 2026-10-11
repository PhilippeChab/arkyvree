import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { HttpError } from "./HttpError.ts";

interface HttpOptions {
  /** Where the pages are cached on disk: the scraper's own folder's (a ruleset's codegen keeps its own). */
  cacheDir: string;
  /** Delay between requests in ms (default: 200) */
  delay?: number;
  /** Disable disk cache (default: false) */
  noCache?: boolean;
  /** A site's HTML made parseable before it's cached and read (its broken tags fixed): as it comes by default. */
  sanitize?: (html: string) => string;
}

const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

const MAX_RETRIES = 3;

/**
 * Fetches the scraped sites' pages: from the disk cache while it holds them (a day), else from the site, a request at a
 * time at most every `delay` ms, retried when the site is busy or fails, but not when it refuses a page or has none (an
 * `HttpError`).
 */
export class HttpClient {
  constructor(private readonly options: HttpOptions) {}

  /** When the last request was sent, which the next one waits `delay` after. */
  private lastRequestTime = 0;

  /** The last request's turn to be sent, which the next one's waits for. */
  private lastTurn: Promise<void> = Promise.resolve();

  private cacheKey(url: string): string {
    return createHash("sha256").update(url).digest("hex");
  }

  private cachePath(url: string): string {
    return join(this.options.cacheDir, `${this.cacheKey(url)}.html`);
  }

  /**
   * Waits for this request's turn: `delay` after the request before it. Requests made together (`Promise.all`) wait in
   * turn, each `delay` after the one before, rather than all at once after the first.
   */
  private rateLimit(): Promise<void> {
    const turn = this.lastTurn.then(async () => {
      const delay = this.options.delay ?? 200;
      const elapsed = Date.now() - this.lastRequestTime;
      if (elapsed < delay) await new Promise((resolve) => setTimeout(resolve, delay - elapsed));

      this.lastRequestTime = Date.now();
    });
    this.lastTurn = turn;
    return turn;
  }

  private readCache(url: string): string | null {
    if (this.options.noCache) return null;

    const path = this.cachePath(url);
    if (!existsSync(path)) return null;

    const stat = statSync(path);
    if (Date.now() - stat.mtimeMs > CACHE_TTL_MS) return null;

    return readFileSync(path, "utf-8");
  }

  private writeCache(url: string, html: string): void {
    if (this.options.noCache) return;

    mkdirSync(this.options.cacheDir, { recursive: true });
    writeFileSync(this.cachePath(url), html);
  }

  /** A page's HTML from its site, sanitized and cached: an error status throws an `HttpError`. */
  private async fetchPage(url: string): Promise<string> {
    const response = await fetch(url);
    if (!response.ok) throw new HttpError(response.status, response.statusText, url);
    const text = await response.text();
    const html = this.options.sanitize ? this.options.sanitize(text) : text;
    this.writeCache(url, html);
    return html;
  }

  /**
   * A page's HTML: from the disk cache, else fetched, rate limited, in up to MAX_RETRIES attempts. A page the site
   * refuses or doesn't have (an `HttpError` that isn't `retryable`, a 404) throws at once: asking again gets the same.
   */
  async fetchHtml(url: string): Promise<string> {
    const cached = this.readCache(url);
    if (cached) return cached;

    await this.rateLimit();

    for (let attempt = 1; ; attempt++) {
      try {
        return await this.fetchPage(url);
      } catch (error) {
        if ((error instanceof HttpError && !error.retryable) || attempt === MAX_RETRIES) throw error;
        const backoff = Math.pow(2, attempt) * 500;
        const reason = error instanceof Error ? error.message : String(error);
        console.warn(`${reason} — retrying in ${backoff}ms (attempt ${attempt}/${MAX_RETRIES})`);
        await new Promise((resolve) => setTimeout(resolve, backoff));
      }
    }
  }
}
