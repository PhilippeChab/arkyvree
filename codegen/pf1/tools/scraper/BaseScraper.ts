import { BookScraper } from "@/codegen/core/scraper/BookScraper.ts";
import References from "@/codegen/pf1/tools/references/References.ts";
import type { Printing } from "@/codegen/pf1/tools/types/pages.ts";
import type { ReferenceByType } from "@/codegen/pf1/tools/types/reference.ts";
import { BOOKS } from "@/vocabulary/pf1/books.ts";

import { type ListedEntry, SourcePage } from "./pages/SourcePage.ts";

/** An entry a book lists under a heading of a kind ("Prestige Classes"), with that heading. */
export interface Listing extends ListedEntry {
  heading: string;
}

/**
 * The links a book's page lists that lead to no entry, each with the page it means: the site's own slips (the Core
 * Rulebook links its Lens of Detection under that name, though the item's page is its plural's), by path.
 */
const MISLINKED: Record<string, string> = {
  "/MagicWondrousDisplay.aspx?FinalName=Lens%20of%20Detection":
    "/MagicWondrousDisplay.aspx?FinalName=Lenses%20of%20Detection",
};

/** Each book's name on aonprd.com, as its book's page and its entries' Source lines name it. */
const SITE_NAMES: Record<(typeof BOOKS)[number], string> = {
  "core-rulebook": "PRPG Core Rulebook",
  "advanced-players-guide": "Advanced Player's Guide",
  "ultimate-magic": "Ultimate Magic",
  "ultimate-combat": "Ultimate Combat",
  "advanced-race-guide": "Advanced Race Guide",
  "ultimate-equipment": "Ultimate Equipment",
  "ultimate-campaign": "Ultimate Campaign",
  "advanced-class-guide": "Advanced Class Guide",
  "pathfinder-unchained": "Pathfinder Unchained",
  "occult-adventures": "Occult Adventures",
  "ultimate-intrigue": "Ultimate Intrigue",
  "horror-adventures": "Horror Adventures",
  "adventurers-guide": "Adventurer's Guide",
  "ultimate-wilderness": "Ultimate Wilderness",
  "planar-adventures": "Planar Adventures",
};

/**
 * The Pathfinder 1 scraper's core, on core's (`BookScraper`: the book it scrapes, the client it fetches pages with,
 * the references it saves what it read to, their overrides kept), which its concerns (`concerns/`) build on: the
 * book's page on aonprd.com, which lists its entries by kind (`listing`), and the reading of each entry's page, which
 * leaves out what an earlier book printed first (`readEntries`).
 */
export class BaseScraper extends BookScraper<ReferenceByType> {
  /** aonprd.com, the Archives of Nethys, whose Pathfinder 1 database the books' entries are scraped from. */
  static readonly site = "https://aonprd.com";

  /** The Pathfinder 1 books' references, which the scraper saves what it read to. */
  protected override readonly references = References;

  /** The book's place among the books, by publication (`BOOKS`): an unknown book throws, naming the known ones. */
  private bookIndex(): number {
    const index = BOOKS.findIndex((book) => book === this.book);
    if (index < 0) throw new Error(`Unknown book "${this.book}". Known books: ${BOOKS.join(", ")}`);
    return index;
  }

  /** The page a listed link leads to: the one it means, for a link that leads to no entry (`MISLINKED`). */
  protected linkedUrl(url: string): string {
    const { pathname, search } = new URL(url);
    const meant = MISLINKED[`${pathname}${search}`];
    return meant ? new URL(meant, BaseScraper.site).href : url;
  }

  /**
   * The earlier book an entry's page says printed it, if any (`sources`, its Source line): the scraper leaves it to
   * that book, whose references hold it ("Longsword": the Core Rulebook's, though Ultimate Equipment reprints it).
   */
  protected reprintOf(sources: Printing[]): string | undefined {
    return BOOKS.slice(0, this.bookIndex()).find((book) => sources.some((source) => source.book === SITE_NAMES[book]));
  }

  /** The book's name on aonprd.com, as its page and its entries' Source lines name it. */
  protected sourceName(): string {
    return SITE_NAMES[BOOKS[this.bookIndex()]];
  }

  /**
   * The book's entries listed under each of `headings` ("Classes", "Prestige Classes"), in its page's order, with the
   * heading each is under, and its page's URL.
   */
  protected async listing(headings: string[]): Promise<{ entries: Listing[]; url: string }> {
    const url = new URL(`/SourceDisplay.aspx?FixedSource=${encodeURIComponent(this.sourceName())}`, BaseScraper.site)
      .href;
    console.log(`Discovering ${headings.join(", ")} from ${url}...`);
    const page = new SourcePage(await this.http.fetchHtml(url), BaseScraper.site);
    const entries = headings.flatMap((heading) =>
      page.entries(heading).map((entry) => ({ ...entry, heading, url: this.linkedUrl(entry.url) })),
    );
    console.log(`  Found ${entries.length}`);
    return { entries, url };
  }

  /**
   * Each listed entry's page, fetched in turn and read by `read`, in the listing's order, with the entries listing it:
   * an entry it can't read is reported and left out, and so is one an earlier book printed first (`reprintOf`). A page
   * the book lists under several names (an item's variants: "Lock (average)", "Lock (good)"; a magic item's bonuses) is
   * read once, with each entry listing it.
   */
  protected async readEntries<E extends { name: string; sources: Printing[] }>(
    entries: Listing[],
    read: (html: string, entry: Listing) => E | undefined,
  ): Promise<{ listings: Listing[]; reading: E }[]> {
    const readings: { listings: Listing[]; reading: E }[] = [];
    for (const listing of entries) {
      const reading = read(await this.http.fetchHtml(listing.url), listing);
      const reprint = reading && this.reprintOf(reading.sources);
      const known = reading && readings.find((earlier) => earlier.reading.name === reading.name);
      if (!reading) {
        console.warn(`  SKIP: Could not read ${listing.name} at ${listing.url}`);
      } else if (reprint) {
        console.log(`  ${reading.name}: a reprint of ${reprint}'s`);
      } else if (known) {
        known.listings.push(listing);
      } else {
        readings.push({ listings: [listing], reading });
        console.log(`  ${reading.name}`);
      }
    }
    console.log(`Read ${readings.length} pages of ${entries.length} entries`);
    return readings;
  }
}
