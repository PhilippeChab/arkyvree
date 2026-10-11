import type { ReferenceFilters } from "@/codegen/dnd3.5/tools/types/reference.ts";
import { CORE_BOOK } from "@/vocabulary/dnd3.5/books.ts";

/** What `parser:dnd3.5:scrape` is asked: the type of reference to scrape, its book, one page, how it fetches pages. */
interface ScrapeRequest {
  book: string;
  delay?: number;
  noCache: boolean;
  type?: string;
  url?: string;
}

/**
 * A parser command's line, read one way by every command: its options (`--type <type>`, a flag such as `--no-cache`)
 * are taken out wherever they stand, an option given without its value or one the command doesn't take is refused
 * (it would be read as nothing, or as a word), and the words left are what the command names. Each command's grammar
 * is a static method: the reference filters most commands take (`filters`), what `parser:dnd3.5:overrides` takes
 * (`overrides`: those and an override key), and what `parser:dnd3.5:scrape` takes (`scrape`).
 */
export class CommandLine {
  private constructor(argv: string[]) {
    this.args = [...argv];
  }

  /**
   * A command's reference filters (the command line's by default): `<book> [<name>] [--type <type>]`, a name matched in
   * lowercase. A command hands them on whole (`References.files(filters)`), so it drops none.
   */
  static filters(argv = process.argv.slice(2)): ReferenceFilters {
    return new CommandLine(argv).referenceFilters("<book> [<name>] [--type <type>]");
  }

  /**
   * What `parser:dnd3.5:overrides` is asked (the command line's by default): the reference filters (`filters`) and the
   * key of the overrides it lists, `<book> [<name>] [--type <type>] [--key <key>]`.
   */
  static overrides(argv = process.argv.slice(2)): { filters: ReferenceFilters; keyFilter?: string } {
    const line = new CommandLine(argv);
    const keyFilter = line.option("key");
    return { filters: line.referenceFilters("<book> [<name>] [--type <type>] [--key <key>]"), keyFilter };
  }

  /**
   * What `parser:dnd3.5:scrape` is asked (the command line's by default): `<type> [--book <slug>] [--url <url>]
   * [--no-cache] [--delay <ms>]`, the core rules' book by default. A delay that isn't a whole number of milliseconds is
   * refused.
   */
  static scrape(argv = process.argv.slice(2)): ScrapeRequest {
    const line = new CommandLine(argv);
    const noCache = line.flag("no-cache");
    const delay = line.option("delay");
    if (delay !== undefined && !(Number.isInteger(Number(delay)) && Number(delay) >= 0))
      throw new Error(`--delay takes a whole number of milliseconds, not "${delay}"`);
    const url = line.option("url");
    const book = line.option("book") ?? CORE_BOOK;
    const [type] = line.words("<type> [--book <slug>] [--url <url>] [--no-cache] [--delay <ms>]");
    return { type, book, url, noCache, ...(delay !== undefined ? { delay: Number(delay) } : {}) };
  }

  /** What's left of the line, as the command takes its options out. */
  private readonly args: string[];

  /** Takes the flag `--<name>` out of the line: whether it was given. */
  private flag(name: string): boolean {
    const index = this.args.indexOf(`--${name}`);
    if (index >= 0) this.args.splice(index, 1);
    return index >= 0;
  }

  /**
   * Takes the option `--<name>` and its value out of the line: none when it isn't given. One given without a value (the
   * line ends, or another option follows) is refused: it would be read as not given.
   */
  private option(name: string): string | undefined {
    const index = this.args.indexOf(`--${name}`);
    if (index < 0) return undefined;
    const [, value] = this.args.splice(index, 2);
    if (value === undefined || value.startsWith("--")) throw new Error(`--${name} takes a value`);
    return value;
  }

  /**
   * The reference filters the rest of the line gives: `--type <type>`, then a book and a name, `usage` saying what the
   * command takes.
   */
  private referenceFilters(usage: string): ReferenceFilters {
    const typeFilter = this.option("type");
    const [bookFilter, name] = this.words(`a book is named without one (${usage})`);
    return { bookFilter, typeFilter, nameFilter: name?.toLowerCase() };
  }

  /** The words left once the command took its options: another option is refused, `usage` saying what it takes. */
  private words(usage: string): string[] {
    // Any other option would be read as a word, and match nothing
    const unknown = this.args.find((arg) => arg.startsWith("--"));
    if (unknown) throw new Error(`Unknown option ${unknown}: ${usage}`);
    return this.args;
  }
}
