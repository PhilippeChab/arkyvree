import type { HttpClient } from "@/codegen/core/scraper/HttpClient.ts";
import References from "@/codegen/dnd3.5/tools/references/References.ts";
import { sanitizeJsonValues } from "@/codegen/dnd3.5/tools/text/sanitize.ts";
import type { ReferenceType, StoredReference } from "@/codegen/dnd3.5/tools/types/reference.ts";

import { ListingPage } from "./pages/ListingPage.ts";

/** A dndtools.net listing of a book's entries: its classes, feats, races or spells. */
type ListingKind = "classes" | "feats" | "races" | "spells";

/** Each book's slug in dndtools.net's URLs: `{book-name}--{id}`. */
const BOOK_SLUGS: Record<string, string> = {
  srd: "players-handbook-v35--6",
  "complete-warrior": "complete-warrior--61",
  "complete-divine": "complete-divine--56",
  "complete-arcane": "complete-arcane--55",
  "complete-adventurer": "complete-adventurer--54",
  "complete-scoundrel": "complete-scoundrel--60",
  dmg: "dungeon-masters-guide-v35--4",
};

/** How many entries a page of a dndtools.net listing holds: its default, which the site refuses to change. */
const LISTING_PAGE_SIZE = 20;

/**
 * A scraper's core, which its concerns (`concerns/`) build on: the book it scrapes, the client it fetches pages with,
 * dndtools.net's listings it finds a book's entries in (`listing`), and the reference files it writes what it read to
 * (`meta`, `saveReference`), keeping the overrides they had.
 */
export class BaseScraper {
  constructor(
    readonly book: string,
    readonly http: HttpClient,
  ) {}

  /** dndtools.net, which the books' classes, feats, races and spells are scraped from. */
  static readonly site = "https://dndtools.net";

  /** A book's id in dndtools.net, which its slug ends with (`complete-divine--56`: 56). */
  private bookId(slug: string): string {
    const match = slug.match(/--(\d+)$/);
    if (!match) throw new Error(`Could not extract book ID from slug "${slug}"`);
    return match[1];
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

  /**
   * The pages of a dndtools.net listing (`url`): its first, then as many more as its "(total N items)" says it holds,
   * fetched in turn.
   */
  private async listingPages(url: string): Promise<string[]> {
    const sep = url.includes("?") ? "&" : "?";
    const page1Url = `${url}${sep}page=1`;
    console.log(`Fetching page 1: ${page1Url}`);
    const page1Html = await this.http.fetchHtml(page1Url);

    // A listing of one page says no total
    const totalMatch = page1Html.match(/\(total\s+(\d+)\s+items?\)/i);
    if (!totalMatch) return [page1Html];

    const total = parseInt(totalMatch[1], 10);
    const totalPages = Math.ceil(total / LISTING_PAGE_SIZE);
    console.log(`  Total: ${total} items across ${totalPages} page(s)`);

    const pages = [page1Html];
    for (let page = 2; page <= totalPages; page++) {
      const pageUrl = `${url}${sep}page=${page}`;
      console.log(`Fetching page ${page}/${totalPages}: ${pageUrl}`);
      pages.push(await this.http.fetchHtml(pageUrl));
    }
    return pages;
  }

  /** The book's slug in dndtools.net's URLs: an unknown book throws, naming the known ones. */
  protected bookSlug(): string {
    const slug = BOOK_SLUGS[this.book];
    if (!slug) throw new Error(`Unknown book "${this.book}". Known books: ${Object.keys(BOOK_SLUGS).join(", ")}`);
    return slug;
  }

  /** Where and when a reference of `type` is scraped from: its page (`sourceUrl`), or its pages (`sourceUrls`). */
  protected meta<T extends ReferenceType, S extends { sourceUrl: string } | { sourceUrls: Record<string, string> }>(
    type: T,
    source: S,
  ): { book: string; scrapedAt: string; type: T } & S {
    return Object.assign({ type, book: this.book, scrapedAt: new Date().toISOString() }, source);
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

  /**
   * The book's entries of a kind, from dndtools.net's listing of them, with absolute URLs, and the listing's URL: its
   * feats' and spells' are the book's own listings; its classes and races are listed with every book's, so only the
   * book's are kept.
   */
  protected async listing(kind: ListingKind): Promise<{ entries: { name: string; url: string }[]; url: string }> {
    const bookSlug = this.bookSlug();
    const { url, only } =
      kind === "classes"
        ? { url: `${BaseScraper.site}/classes/`, only: bookSlug }
        : kind === "races"
          ? { url: `${BaseScraper.site}/races/?rulebook=${this.bookId(bookSlug)}`, only: bookSlug }
          : { url: `${BaseScraper.site}/${kind}/${bookSlug}/`, only: undefined };
    console.log(`Discovering ${kind} from ${url}${only ? ` (filtering for ${only})` : ""}...`);

    const entries: { name: string; url: string }[] = [];
    for (const pageHtml of await this.listingPages(url)) {
      for (const entry of new ListingPage(pageHtml).entries(kind)) {
        if (only && !entry.url.includes(`/${only}/`)) continue;
        entries.push({
          name: entry.name,
          url: entry.url.startsWith("http") ? entry.url : `${BaseScraper.site}${entry.url}`,
        });
      }
    }
    return { entries, url };
  }
}
