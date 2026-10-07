import type { ReferenceFilters } from "@/database/packages/dnd35-from-parser/tools/types/reference.ts";
import { CORE_BOOK } from "@/database/packages/dnd35-from-parser/tools/vocabulary/books.ts";

/** What `parser:scrape` is asked: the type of reference to scrape, its book, one page, and how it fetches pages. */
type ScrapeRequest = { book: string; delay?: number; noCache: boolean; type?: string; url?: string };

/**
 * A parser command's line, read one way by every command: its options (`--type <type>`, a flag such as `--no-cache`)
 * are taken out wherever they stand, an option the command doesn't take is refused (it would be read as a word), and
 * the words left are what the command names. Each command's grammar is a static method: the reference filters most
 * commands take (`filters`), and what `parser:scrape` takes (`scrape`).
 */
export class CommandLine {
  private constructor(argv: string[]) {
    this.args = [...argv];
  }

  /**
   * A command's reference filters (the command line's by default): `<book> [<name>] [--type <type>] [--key <key>]`, a
   * name matched in lowercase.
   */
  static filters(argv = process.argv.slice(2)): ReferenceFilters & { keyFilter?: string } {
    const line = new CommandLine(argv);
    const typeFilter = line.option("type")?.value;
    const keyFilter = line.option("key")?.value;
    const [bookFilter, name] = line.words("a book is named without one (<book> [<name>] [--type <type>])");
    return { bookFilter, typeFilter, nameFilter: name?.toLowerCase(), keyFilter };
  }

  /**
   * What `parser:scrape` is asked (the command line's by default): `<type> [--book <slug>] [--url <url>] [--no-cache]
   * [--delay <ms>]`, the core rules' book by default. A delay that isn't a whole number of milliseconds is refused.
   */
  static scrape(argv = process.argv.slice(2)): ScrapeRequest {
    const line = new CommandLine(argv);
    const noCache = line.flag("no-cache");
    const delay = line.option("delay");
    if (delay && !(Number.isInteger(Number(delay.value)) && Number(delay.value) >= 0))
      throw new Error(`--delay takes a whole number of milliseconds, not "${delay.value}"`);
    const url = line.option("url")?.value;
    const book = line.option("book")?.value ?? CORE_BOOK;
    const [type] = line.words("<type> [--book <slug>] [--url <url>] [--no-cache] [--delay <ms>]");
    return { type, book, url, noCache, ...(delay ? { delay: Number(delay.value) } : {}) };
  }

  /** What's left of the line, as the command takes its options out. */
  private readonly args: string[];

  /** Takes the flag `--<name>` out of the line: whether it was given. */
  private flag(name: string): boolean {
    const index = this.args.indexOf(`--${name}`);
    if (index >= 0) this.args.splice(index, 1);
    return index >= 0;
  }

  /** Takes the option `--<name>` and its value out of the line: none when it isn't given. */
  private option(name: string): { value?: string } | undefined {
    const index = this.args.indexOf(`--${name}`);
    return index >= 0 ? { value: this.args.splice(index, 2)[1] } : undefined;
  }

  /** The words left once the command took its options: another option is refused, `usage` saying what it takes. */
  private words(usage: string): string[] {
    // Any other option would be read as a word, and match nothing
    const unknown = this.args.find((arg) => arg.startsWith("--"));
    if (unknown) throw new Error(`Unknown option ${unknown}: ${usage}`);
    return this.args;
  }
}
