import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { sanitizeHtml } from "@/database/packages/dnd35-from-parser/tools/text/sanitize.ts";

interface HttpOptions {
  /** Delay between requests in ms (default: 200) */
  delay?: number;
  /** Disable disk cache (default: false) */
  noCache?: boolean;
}

const CACHE_DIR = join(import.meta.dirname!, ".cache");
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

const MAX_RETRIES = 3;

/**
 * Fetches the scraped sites' pages: from the disk cache while it holds them (a day), else from the site, a request at a
 * time at most every `delay` ms, retried when the site is busy or fails.
 */
export class HttpClient {
  constructor(private readonly options: HttpOptions = {}) {}

  /** When the last request was sent, which the next one waits `delay` after. */
  private lastRequestTime = 0;

  /** The last request's turn to be sent, which the next one's waits for. */
  private lastTurn: Promise<void> = Promise.resolve();

  private cacheKey(url: string): string {
    return createHash("sha256").update(url).digest("hex");
  }

  private cachePath(url: string): string {
    return join(CACHE_DIR, `${this.cacheKey(url)}.html`);
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

    mkdirSync(CACHE_DIR, { recursive: true });
    writeFileSync(this.cachePath(url), html);
  }

  /** A page's HTML: from the disk cache, else fetched, rate limited, with up to MAX_RETRIES attempts. */
  async fetchHtml(url: string): Promise<string> {
    // Check cache first
    const cached = this.readCache(url);
    if (cached) return cached;

    await this.rateLimit();

    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        const response = await fetch(url);

        if (response.status === 429 || response.status >= 500) {
          const backoff = Math.pow(2, attempt) * 500;
          console.warn(
            `HTTP ${response.status} for ${url} — retrying in ${backoff}ms (attempt ${attempt}/${MAX_RETRIES})`,
          );
          await new Promise((resolve) => setTimeout(resolve, backoff));
          continue;
        }

        if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText} — ${url}`);

        const html = sanitizeHtml(await response.text());
        this.writeCache(url, html);
        return html;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        if (attempt < MAX_RETRIES) {
          const backoff = Math.pow(2, attempt) * 500;
          console.warn(`Fetch error for ${url} — retrying in ${backoff}ms (attempt ${attempt}/${MAX_RETRIES})`);
          await new Promise((resolve) => setTimeout(resolve, backoff));
        }
      }
    }

    throw lastError ?? new Error(`Failed to fetch ${url} after ${MAX_RETRIES} attempts`);
  }
}
