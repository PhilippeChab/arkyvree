import { describe, expect, test } from "bun:test";

import { CommandLine } from "@/codegen/core/cli/CommandLine.ts";

describe("A parser command's line", () => {
  test("name a book and a reference, and filter by type", () => {
    expect(CommandLine.filters(["core", "Hero", "--type", "class"])).toEqual({
      bookFilter: "core",
      nameFilter: "hero",
      typeFilter: "class",
    });
    expect(CommandLine.filters(["--type", "feat"])).toEqual({ typeFilter: "feat" });
  });

  test("refuse an option they don't know, which would be read as a book", () => {
    expect(() => CommandLine.filters(["--book", "core"])).toThrow("Unknown option --book");
  });

  test("ask a parser's overrides command for an override key besides, which no other command takes", () => {
    expect(CommandLine.overrides(["core", "--key", "requirements", "--type", "feat"])).toEqual({
      filters: { bookFilter: "core", typeFilter: "feat" },
      keyFilter: "requirements",
    });
    expect(CommandLine.overrides([])).toEqual({ filters: {} });
    expect(() => CommandLine.filters(["core", "--key", "requirements"])).toThrow("Unknown option --key");
  });

  test("asks the scraper for a type of reference, from a book, a page, with its own fetching, the options anywhere", () => {
    expect(
      CommandLine.scrape("core", ["--book", "a-book", "class", "--url", "https://x/", "--no-cache", "--delay", "0"]),
    ).toEqual({
      type: "class",
      book: "a-book",
      url: "https://x/",
      noCache: true,
      delay: 0,
    });
    expect(CommandLine.scrape("core", ["feat"])).toEqual({ type: "feat", book: "core", noCache: false });
    expect(CommandLine.scrape("core", []).type).toBeUndefined();
  });

  test("refuses the scraper a delay that isn't a whole number of milliseconds, and an option it doesn't take", () => {
    expect(() => CommandLine.scrape("core", ["class", "--delay", "1.5"])).toThrow(
      '--delay takes a whole number of milliseconds, not "1.5"',
    );
    expect(() => CommandLine.scrape("core", ["class", "--delay"])).toThrow("--delay takes a value");
    expect(() => CommandLine.scrape("core", ["class", "--type", "feat"])).toThrow("Unknown option --type");
  });

  test("refuses an option given without its value, which would be read as not given", () => {
    expect(() => CommandLine.scrape("core", ["class", "--book"])).toThrow("--book takes a value");
    expect(() => CommandLine.scrape("core", ["class", "--url", "--no-cache"])).toThrow("--url takes a value");
    expect(() => CommandLine.filters(["core", "--type"])).toThrow("--type takes a value");
  });
});
