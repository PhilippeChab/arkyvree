import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { sanitizeHtml } from "@/database/packages/dnd35-from-parser/tools/sanitize.ts";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

interface HttpOptions {
  /** Disable disk cache (default: false) */
  noCache?: boolean;
  /** Delay between requests in ms (default: 200) */
  delay?: number;
}

const CACHE_DIR = join(import.meta.dirname!, ".cache");
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const MAX_RETRIES = 3;

let globalOptions: HttpOptions = {};

export function configureHttp(opts: HttpOptions): void {
  globalOptions = { ...globalOptions, ...opts };
}

// ---------------------------------------------------------------------------
// Rate limiting
// ---------------------------------------------------------------------------

let lastRequestTime = 0;

async function rateLimit(): Promise<void> {
  const delay = globalOptions.delay ?? 200;
  const elapsed = Date.now() - lastRequestTime;
  if (elapsed < delay) {
    await new Promise((resolve) => setTimeout(resolve, delay - elapsed));
  }
  lastRequestTime = Date.now();
}

// ---------------------------------------------------------------------------
// Disk cache
// ---------------------------------------------------------------------------

function cacheKey(url: string): string {
  return createHash("sha256").update(url).digest("hex");
}

function cachePath(url: string): string {
  return join(CACHE_DIR, `${cacheKey(url)}.html`);
}

function readCache(url: string): string | null {
  if (globalOptions.noCache) return null;

  const path = cachePath(url);
  if (!existsSync(path)) return null;

  const stat = statSync(path);
  if (Date.now() - stat.mtimeMs > CACHE_TTL_MS) return null;

  return readFileSync(path, "utf-8");
}

function writeCache(url: string, html: string): void {
  if (globalOptions.noCache) return;

  mkdirSync(CACHE_DIR, { recursive: true });
  writeFileSync(cachePath(url), html);
}

// ---------------------------------------------------------------------------
// Fetch with retry
// ---------------------------------------------------------------------------

export async function fetchHtml(url: string): Promise<string> {
  // Check cache first
  const cached = readCache(url);
  if (cached) return cached;

  await rateLimit();

  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await fetch(url);

      if (response.status === 429 || response.status >= 500) {
        const backoff = Math.pow(2, attempt) * 500;
        console.warn(`HTTP ${response.status} for ${url} — retrying in ${backoff}ms (attempt ${attempt}/${MAX_RETRIES})`);
        await new Promise((resolve) => setTimeout(resolve, backoff));
        continue;
      }

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText} — ${url}`);
      }

      const html = sanitizeHtml(await response.text());
      writeCache(url, html);
      return html;
    } catch (err) {
      lastError = err as Error;
      if (attempt < MAX_RETRIES) {
        const backoff = Math.pow(2, attempt) * 500;
        console.warn(`Fetch error for ${url} — retrying in ${backoff}ms (attempt ${attempt}/${MAX_RETRIES})`);
        await new Promise((resolve) => setTimeout(resolve, backoff));
      }
    }
  }

  throw lastError ?? new Error(`Failed to fetch ${url} after ${MAX_RETRIES} attempts`);
}

// ---------------------------------------------------------------------------
// Paginated fetching
// ---------------------------------------------------------------------------

/**
 * Fetch all pages from a paginated dndtools.net listing.
 *
 * Page 1 is fetched first to extract the total item count from the
 * "(total N items)" text. Remaining pages are fetched sequentially
 * (to respect rate limiting).
 *
 * Note: dndtools.net returns 500 for custom `page_size` params,
 * so we use the default page size (20 items) and paginate with `?page=N`.
 *
 * Returns an array of HTML strings, one per page.
 */
export async function fetchAllPages(baseUrl: string): Promise<string[]> {
  const PAGE_SIZE = 20; // dndtools.net default, cannot be changed
  const sep = baseUrl.includes("?") ? "&" : "?";
  const page1Url = `${baseUrl}${sep}page=1`;

  console.log(`Fetching page 1: ${page1Url}`);
  const page1Html = await fetchHtml(page1Url);

  // Extract total from "(total N items)"
  const totalMatch = page1Html.match(/\(total\s+(\d+)\s+items?\)/i);
  if (!totalMatch) {
    // Single page — no pagination indicator
    return [page1Html];
  }

  const total = parseInt(totalMatch[1], 10);
  const totalPages = Math.ceil(total / PAGE_SIZE);
  console.log(`  Total: ${total} items across ${totalPages} page(s)`);

  if (totalPages <= 1) return [page1Html];

  const pages = [page1Html];
  for (let page = 2; page <= totalPages; page++) {
    const pageUrl = `${baseUrl}${sep}page=${page}`;
    console.log(`Fetching page ${page}/${totalPages}: ${pageUrl}`);
    pages.push(await fetchHtml(pageUrl));
  }

  return pages;
}
