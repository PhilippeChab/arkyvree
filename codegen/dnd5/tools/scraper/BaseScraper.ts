import { BookScraper } from "@/codegen/core/scraper/BookScraper.ts";
import References from "@/codegen/dnd5/tools/references/References.ts";
import type { ReferenceByType, ReferenceType } from "@/codegen/dnd5/tools/types/reference.ts";
import { BOOKS } from "@/vocabulary/dnd5/books.ts";

import { stripLinks } from "./datasets.ts";

/** A file of the database read, its links stripped: its entries, and where it was read from. */
interface Dataset<T> {
  entries: T[];
  url: string;
}

/**
 * The 5e-bits database's 2024 files, in English, at the commit the references were read from: its repository (5e-bits'
 * `5e-srd-api`, MIT) transcribes the SRD 5.2.1 into JSON. A newer commit is taken by changing it here and scraping again.
 */
const DATABASE =
  "https://raw.githubusercontent.com/5e-bits/5e-srd-api/67d8c6aad9a273862fc5ff5f633fcdc06130b94c/packages/5e-database/src/2024/en";

/**
 * The D&D 5th Edition scraper's core, on core's (`BookScraper`: the book it scrapes, the client it fetches with, the
 * references it saves what it read to, their overrides kept), which its concerns (`concerns/`) build on: the
 * database's files, each read whole (`dataset`), and a reference saved from them (`saveDatasets`). The book is the
 * SRD 5.2.1, the database's only one: another is refused.
 */
export class BaseScraper extends BookScraper<ReferenceByType> {
  /** The D&D 5th Edition book's references, which the scraper saves what it read to. */
  protected override readonly references = References;

  /** The book scraped, checked against the books the parser reads (`BOOKS`): another throws, naming them. */
  private checkBook() {
    if (!BOOKS.some((book) => book === this.book))
      throw new Error(`Unknown book "${this.book}". Known books: ${BOOKS.join(", ")}`);
  }

  /** Where and when a reference read from `datasets` was scraped: each file's URL, by its name. */
  protected datasetMeta<T extends ReferenceType>(type: T, datasets: Record<string, Dataset<unknown>>) {
    const sourceUrls = Object.fromEntries(Object.entries(datasets).map(([name, dataset]) => [name, dataset.url]));
    return this.meta(type, { sourceUrls });
  }

  /** A file of the database (`5e-SRD-<name>.json`), read whole, its links stripped (`stripLinks`). */
  protected async dataset<T>(name: string): Promise<Dataset<T>> {
    this.checkBook();
    const url = `${DATABASE}/5e-SRD-${name}.json`;
    console.log(`Reading ${name} from ${url}...`);
    const entries: T[] = stripLinks(JSON.parse(await this.http.fetchHtml(url)));
    console.log(`  Read ${entries.length}`);
    return { entries, url };
  }
}
