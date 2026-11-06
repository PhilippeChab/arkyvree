import { HttpClient } from "@/codegen/core/scraper/HttpClient.ts";

import { CommandLine } from "./CommandLine.ts";

/** A ruleset's scrape command: its name, its core rules' book, its cache, its site's clean-up and its scraper's types. */
interface ScrapeCommandOptions<S> {
  /** Where the scraper caches the pages it fetches: its own folder's, which git ignores. */
  cacheDir: string;
  /** The command's name, as `package.json` runs it (`parser:<ruleset>:scrape`). */
  command: string;
  /** The book scraped when the command names none. */
  coreBook: string;
  /** The site's HTML made parseable before it's cached and read: as it comes by default. */
  sanitize?: (html: string) => string;
  /** The ruleset's scraper of a book, fetching through `http`. */
  scraper(book: string, http: HttpClient): S;
  /** The types of reference the scraper scrapes, by the name the command takes. */
  types: Record<string, ScrapedType<S>>;
}

/** A type of reference a ruleset's scraper scrapes (`S`): what it is, a book's whole, and one page of it. */
export interface ScrapedType<S> {
  /** Scrapes the book's whole reference of the type. */
  all(scraper: S): Promise<void>;
  /** What the type is, as the command's usage lists it, and what scraping one page of it does (`one`). */
  help: string;
  /** Scrapes one page of the type, as its help says (printed, or saved into its reference): none for a type read whole. */
  one?(scraper: S, url: string): Promise<void>;
}

/**
 * A parser's `scrape` command, every ruleset's run one way: `<type> [--book <slug>] [--url <url>] [--no-cache]
 * [--delay <ms>]` (`CommandLine.scrape`), which scrapes a book's reference of a type, or one page of it. A line the
 * command can't take (no type, a type it doesn't know, an option it doesn't take, a page of a type read whole) is
 * refused: the command prints why and its usage, scrapes nothing, and answers why, which fails its script.
 */
export class ScrapeCommand<S> {
  constructor(private readonly options: ScrapeCommandOptions<S>) {}

  /** Prints why the line can't be taken, then the usage, and answers why. */
  private refuse(reason: string): string {
    console.error(reason);
    console.error(this.usage());
    return reason;
  }

  /** What the command takes: its line, its types and its options. */
  private usage(): string {
    const { command, coreBook, types } = this.options;
    return [
      `Usage: bun run ${command} <type> [--book <slug>] [--url <url>] [--no-cache] [--delay <ms>]`,
      "",
      "  Types:",
      ...Object.entries(types).map(([name, type]) => `    ${name.padEnd(18)} ${type.help}`),
      "",
      "  Options:",
      `    --book <slug>      The book scraped (default: ${coreBook})`,
      "    --url <url>        Scrape one page of the type, as its type says",
      "    --no-cache         Fetch every page, past the disk cache",
      "    --delay <ms>       Delay between requests (default: 200)",
    ].join("\n");
  }

  /** Runs the command on its line (the process's by default): why it refused the line, or nothing once it scraped. */
  async run(argv = process.argv.slice(2)): Promise<string | undefined> {
    let request: ReturnType<typeof CommandLine.scrape>;
    try {
      request = CommandLine.scrape(this.options.coreBook, argv);
    } catch (error) {
      // A delay that isn't a whole number, or an option the scraper doesn't take
      return this.refuse(error instanceof Error ? error.message : String(error));
    }
    const { type: name, book, url, noCache, delay } = request;
    if (!name) return this.refuse("Name the type of reference to scrape.");
    const type = Object.hasOwn(this.options.types, name) ? this.options.types[name] : undefined;
    if (!type) return this.refuse(`Unknown type: ${name}. Supported: ${Object.keys(this.options.types).join(", ")}`);
    if (url && !type.one) return this.refuse(`A ${name} reference is read whole: --url doesn't apply to it.`);

    const { cacheDir, sanitize } = this.options;
    const http = new HttpClient({
      cacheDir,
      noCache,
      ...(sanitize ? { sanitize } : {}),
      ...(delay !== undefined ? { delay } : {}),
    });
    const scraper = this.options.scraper(book, http);
    if (url && type.one) await type.one(scraper, url);
    else await type.all(scraper);
    return undefined;
  }
}
