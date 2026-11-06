/**
 * What every ruleset's parser's references share: a reference as stored (what its scraper read, `raw`, and the
 * corrections made by hand, `overrides`), where and when it was scraped, its file, and what a command selects files by.
 */

/** A reference file: where it is, and the type, page and book its `_meta` names. */
export interface ReferenceFile<T extends string = string> {
  book: string;
  path: string;
  type: T;
  url?: string;
}

/** What a command selects reference files by (`CommandLine.filters`): a book, a type, a name (its file's, lowercased). */
export interface ReferenceFilters {
  bookFilter?: string;
  nameFilter?: string;
  typeFilter?: string;
}

/** Where and when a reference was scraped. */
export interface ScrapedMeta<T extends string> {
  book: string;
  scrapedAt: string;
  sourceUrl: string;
  type: T;
}

/**
 * What a reference of any ruleset's parser holds, at least: its `_meta` (its type, its book, when it was scraped and,
 * for a reference read from one page, that page), what its scraper read (`raw`) and its corrections (`overrides`).
 */
export interface StoredShape<T extends string = string> {
  _meta: { book: string; scrapedAt: string; sourceUrl?: string; type: T };
  overrides?: unknown;
  raw: unknown;
}

/**
 * A reference's overrides (corrections made by hand, stored in its file and kept across re-scrapes) by entry name,
 * and the entries reviewed (no further action needed).
 */
export type Overrides<T> = Record<string, T> & { reviewed?: string[] };

/** A reference as it's stored: what the scraper read, and the corrections made by hand, nothing else. */
export type Stored<R extends StoredShape> = Pick<R, "_meta" | "raw" | "overrides">;
