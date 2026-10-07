import References from "@/database/packages/dnd35-from-parser/tools/references/References.ts";
import { sanitizeJsonValues } from "@/database/packages/dnd35-from-parser/tools/text/sanitize.ts";
import type { ReferenceType, StoredReference } from "@/database/packages/dnd35-from-parser/tools/types/reference.ts";

import { BASE_URL, getBookSlug } from "./books.ts";
import type { HttpClient } from "./HttpClient.ts";
import { parseListingHtml } from "./parsers/page.ts";

/**
 * A scraper's core, which its concerns (`concerns/`) build on: the book it scrapes, the client it fetches pages with,
 * the listings it finds a book's entries in, and the reference files it writes what it read to, keeping the overrides
 * they had.
 */
export class BaseScraper {
  constructor(
    readonly book: string,
    readonly http: HttpClient,
  ) {}

  /** The book's slug in dndtools.net's URLs. */
  protected bookSlug(): string {
    return getBookSlug(this.book);
  }

  /** Saves a reference as scraped (its `_meta` and `raw`), keeping the overrides its file had. */
  protected saveReference<T extends ReferenceType>(
    outPath: string,
    _meta: StoredReference<T>["_meta"] & { type: T },
    raw: StoredReference<T>["raw"],
  ) {
    this.writeReference(outPath, this.scrapedReference(outPath, _meta, raw));
  }

  /**
   * Saves a reference as scraped (`saveReference`), and returns it with what the generator reads derived from it. A
   * reference that can't be derived isn't written.
   */
  protected saveResolvedReference<T extends ReferenceType>(
    outPath: string,
    _meta: StoredReference<T>["_meta"] & { type: T },
    raw: StoredReference<T>["raw"],
  ) {
    const reference = this.scrapedReference(outPath, _meta, raw);
    const resolved = References.resolve(_meta.type, reference);
    this.writeReference(outPath, reference);
    return resolved;
  }

  /** A reference as scraped (its `_meta` and `raw`), with the overrides its file had. */
  private scrapedReference<T extends ReferenceType>(
    outPath: string,
    _meta: StoredReference<T>["_meta"] & { type: T },
    raw: StoredReference<T>["raw"],
  ): StoredReference<T> {
    const overrides = References.overrides(outPath, _meta.type);
    if (overrides) console.log(`  Preserving existing overrides from ${outPath}`);
    return sanitizeJsonValues({ _meta, raw, ...(overrides ? { overrides } : {}) });
  }

  /** Writes a reference to its file, unless all that changed is when it was scraped. */
  private writeReference(outPath: string, reference: StoredReference) {
    console.log(`${References.write(outPath, reference) ? "Written" : "Unchanged"}: ${outPath}`);
  }

  /** A listing's entries across its pages, with absolute URLs: only `bookSlug`'s, when given. */
  protected async discover(listingUrl: string, section: string, bookSlug?: string) {
    const entries: { name: string; url: string }[] = [];
    for (const pageHtml of await this.http.fetchAllPages(listingUrl)) {
      for (const { name, url } of parseListingHtml(pageHtml, section)) {
        if (bookSlug && !url.includes(`/${bookSlug}/`)) continue;
        entries.push({ name, url: url.startsWith("http") ? url : `${BASE_URL}${url}` });
      }
    }
    return entries;
  }
}
