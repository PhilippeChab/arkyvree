import type { ReferenceStore } from "@/codegen/core/references/ReferenceStore.ts";
import type { Stored, StoredShape } from "@/codegen/core/references/types.ts";

import type { HttpClient } from "./HttpClient.ts";

/**
 * A scraper of a ruleset's books, whatever its site: the book it scrapes, the client it fetches pages with, and the
 * references it saves what it read to (`references`, its ruleset's store), each with the overrides its file had. A
 * ruleset's scraper says where its site lists a book's entries and how its pages read; its concerns, a kind of
 * reference each, save what they read through `saveReference`.
 */
export abstract class BookScraper<ByType extends { [T in keyof ByType & string]: StoredShape<T> }> {
  constructor(
    readonly book: string,
    readonly http: HttpClient,
  ) {}

  /** The store the scraper's references are saved to: its ruleset's. */
  protected abstract readonly references: ReferenceStore<ByType>;

  /** What a reference stores of what was scraped, cleaned as its ruleset cleans its text: as read, by default. */
  protected cleanStored<S>(stored: S): S {
    return stored;
  }

  /** Where and when a reference of `type` is scraped from: its page (`sourceUrl`), or its pages (`sourceUrls`). */
  protected meta<
    T extends keyof ByType & string,
    S extends { sourceUrl: string } | { sourceUrls: Record<string, string> },
  >(type: T, source: S): { book: string; scrapedAt: string; type: T } & S {
    return Object.assign({ type, book: this.book, scrapedAt: new Date().toISOString() }, source);
  }

  /** Saves a reference as scraped (its `_meta` and `raw`), keeping the overrides its file had. */
  protected saveReference<T extends keyof ByType & string>(
    outPath: string,
    _meta: Stored<ByType[T]>["_meta"],
    raw: Stored<ByType[T]>["raw"],
  ) {
    this.writeReference(outPath, this.scrapedReference<T>(outPath, _meta, raw));
  }

  /** A reference as scraped (its `_meta` and `raw`), with the overrides its file had, cleaned (`cleanStored`). */
  protected scrapedReference<T extends keyof ByType & string>(
    outPath: string,
    _meta: Stored<ByType[T]>["_meta"],
    raw: Stored<ByType[T]>["raw"],
  ): Stored<ByType[T]> {
    const overrides = this.references.overrides(outPath, _meta.type as T);
    if (overrides) console.log(`  Preserving existing overrides from ${outPath}`);
    return this.cleanStored({ _meta, raw, ...(overrides ? { overrides } : {}) } as Stored<ByType[T]>);
  }

  /** Writes a reference to its file, unless all that changed is when it was scraped. */
  protected writeReference(outPath: string, reference: Stored<StoredShape>) {
    console.log(`${this.references.write(outPath, reference) ? "Written" : "Unchanged"}: ${outPath}`);
  }
}
