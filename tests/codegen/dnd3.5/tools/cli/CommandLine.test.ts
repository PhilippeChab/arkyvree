import { describe, expect, test } from "bun:test";

import { CommandLine } from "@/codegen/dnd3.5/tools/cli/CommandLine.ts";

describe("A parser command's line", () => {
  test("name a book and a reference, and filter by type and key", () => {
    expect(CommandLine.filters(["srd", "Wizard", "--type", "class", "--key", "requirements"])).toEqual({
      bookFilter: "srd",
      nameFilter: "wizard",
      typeFilter: "class",
      keyFilter: "requirements",
    });
    expect(CommandLine.filters(["--type", "feat"])).toEqual({ typeFilter: "feat" });
  });

  test("refuse an option they don't know, which would be read as a book", () => {
    expect(() => CommandLine.filters(["--book", "srd"])).toThrow("Unknown option --book");
  });

  test("asks the scraper for a type of reference, from a book, a page, with its own fetching, the options anywhere", () => {
    expect(
      CommandLine.scrape(["--book", "complete-divine", "class", "--url", "https://x/", "--no-cache", "--delay", "0"]),
    ).toEqual({
      type: "class",
      book: "complete-divine",
      url: "https://x/",
      noCache: true,
      delay: 0,
    });
    expect(CommandLine.scrape(["feat"])).toEqual({ type: "feat", book: "srd", noCache: false });
    expect(CommandLine.scrape([]).type).toBeUndefined();
  });

  test("refuses the scraper a delay that isn't a whole number of milliseconds, and an option it doesn't take", () => {
    expect(() => CommandLine.scrape(["class", "--delay", "1.5"])).toThrow(
      '--delay takes a whole number of milliseconds, not "1.5"',
    );
    expect(() => CommandLine.scrape(["class", "--delay"])).toThrow("--delay takes a value");
    expect(() => CommandLine.scrape(["class", "--type", "feat"])).toThrow("Unknown option --type");
  });

  test("refuses an option given without its value, which would be read as not given", () => {
    expect(() => CommandLine.scrape(["class", "--book"])).toThrow("--book takes a value");
    expect(() => CommandLine.scrape(["class", "--url", "--no-cache"])).toThrow("--url takes a value");
    expect(() => CommandLine.filters(["srd", "--type"])).toThrow("--type takes a value");
  });
});
