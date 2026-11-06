import { describe, expect, test } from "bun:test";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { ScrapeCommand } from "@/codegen/core/cli/ScrapeCommand.ts";
import { HttpClient } from "@/codegen/core/scraper/HttpClient.ts";

/** A scrape command of notes and tables, read with a made-up scraper whose calls `calls` records. */
function commandOf(calls: Calls) {
  return new ScrapeCommand<ReturnType<Calls["scraperOf"]>>({
    cacheDir: join(tmpdir(), "scrape-command-cache"),
    command: "parser:test:scrape",
    coreBook: "core",
    scraper: (book, http) => calls.scraperOf(book, http),
    types: {
      note: { help: "A book's notes", all: (scraper) => scraper.notes(), one: (scraper, url) => scraper.note(url) },
      table: { help: "A book's tables", all: (scraper) => scraper.tables() },
    },
  });
}

/** What a made-up scraper was asked to scrape: each call's book, type and page. */
class Calls {
  readonly asked: string[] = [];
  /** The clients each scraper was handed to fetch its pages with. */
  readonly clients: HttpClient[] = [];

  scraperOf(book: string, http: HttpClient) {
    this.clients.push(http);
    return {
      notes: async () => void this.asked.push(`${book}: every note`),
      note: async (url: string) => void this.asked.push(`${book}: the note at ${url}`),
      tables: async () => void this.asked.push(`${book}: every table`),
    };
  }
}

describe("A parser's scrape command", () => {
  test("scrapes a book's reference of a type, the core rules' book unless it names one", async () => {
    const calls = new Calls();
    expect(await commandOf(calls).run(["note"])).toBeUndefined();
    expect(await commandOf(calls).run(["table", "--book", "second"])).toBeUndefined();
    expect(calls.asked).toEqual(["core: every note", "second: every table"]);
    expect(calls.clients.every((client) => client instanceof HttpClient)).toBe(true);
  });

  test("reads one page of a type that reads one", async () => {
    const calls = new Calls();
    expect(await commandOf(calls).run(["note", "--url", "https://x/1"])).toBeUndefined();
    expect(calls.asked).toEqual(["core: the note at https://x/1"]);
  });

  test("scrapes nothing for a line it can't take, saying why", async () => {
    const calls = new Calls();
    expect(await commandOf(calls).run([])).toBe("Name the type of reference to scrape.");
    expect(await commandOf(calls).run(["spell"])).toBe("Unknown type: spell. Supported: note, table");
    expect(await commandOf(calls).run(["toString"])).toBe("Unknown type: toString. Supported: note, table");
    expect(await commandOf(calls).run(["table", "--url", "https://x/1"])).toBe(
      "A table reference is read whole: --url doesn't apply to it.",
    );
    expect(await commandOf(calls).run(["note", "--type", "table"])).toStartWith("Unknown option --type");
    expect(calls.asked).toEqual([]);
  });
});
