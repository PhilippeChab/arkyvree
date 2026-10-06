import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import { REFERENCE_DIR } from "@/database/packages/dnd35-from-parser/tools/referenceFiles.ts";
import {
  readStoredOverrides,
  type ReferenceType,
  resolveReference,
  type StoredReference,
} from "@/database/packages/dnd35-from-parser/tools/references.ts";
import {
  sanitizeJsonValues,
  sortKeysDeep,
  stringifyStably,
} from "@/database/packages/dnd35-from-parser/tools/sanitize.ts";
import { BASE_URL, getBookSlug } from "@/database/packages/dnd35-from-parser/tools/scraper/books.ts";
import type { HttpClient } from "@/database/packages/dnd35-from-parser/tools/scraper/HttpClient.ts";
import { parseListingHtml } from "@/database/packages/dnd35-from-parser/tools/scraper/parsers/page.ts";
import { isRecord } from "@/shared/isRecord.ts";

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

  /** The path of the book's reference file `file` (`feats.json`, `classes/wizard.json`). */
  protected referencePath(...file: string[]): string {
    return join(REFERENCE_DIR, this.book, ...file);
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
    const resolved = resolveReference(_meta.type, reference);
    this.writeReference(outPath, reference);
    return resolved;
  }

  /** A reference as scraped (its `_meta` and `raw`), with the overrides its file had. */
  private scrapedReference<T extends ReferenceType>(
    outPath: string,
    _meta: StoredReference<T>["_meta"] & { type: T },
    raw: StoredReference<T>["raw"],
  ): StoredReference<T> {
    const overrides = readStoredOverrides(outPath, _meta.type);
    if (overrides) console.log(`  Preserving existing overrides from ${outPath}`);
    return sanitizeJsonValues({ _meta, raw, ...(overrides ? { overrides } : {}) });
  }

  /** Writes a reference, unless all that changed is when it was scraped. */
  private writeIfChanged(outPath: string, data: StoredReference): void {
    const newJson = stringifyStably(data);
    if (existsSync(outPath)) {
      const oldData = sortKeysDeep(JSON.parse(readFileSync(outPath, "utf-8")));
      const stripTimestamp = (d: unknown) => {
        const copy = structuredClone(d);
        if (isRecord(copy) && isRecord(copy._meta)) delete copy._meta.scrapedAt;
        return JSON.stringify(copy);
      };
      if (stripTimestamp(sortKeysDeep(data)) === stripTimestamp(oldData)) {
        return;
      }
    }
    mkdirSync(dirname(outPath), { recursive: true });
    writeFileSync(outPath, newJson);
  }

  /** Writes a reference to its file, when it changed. */
  private writeReference(outPath: string, reference: StoredReference) {
    this.writeIfChanged(outPath, reference);
    console.log(`Written: ${outPath}`);
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
