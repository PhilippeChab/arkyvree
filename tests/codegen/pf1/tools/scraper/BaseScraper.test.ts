import { describe, expect, test } from "bun:test";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { HttpClient } from "@/codegen/core/scraper/HttpClient.ts";
import { BaseScraper, type Listing } from "@/codegen/pf1/tools/scraper/BaseScraper.ts";
import { ItemPage } from "@/codegen/pf1/tools/scraper/pages/ItemPage.ts";
import type { Printing } from "@/codegen/pf1/tools/types/pages.ts";
import { fixture } from "@/tests/support/pf1/scrapedPages.ts";

/** The URLs of the saved pages a test's scraper fetches. */
const PAGES = {
  cloak: "https://aonprd.com/MagicWondrousDisplay.aspx?FinalName=Cloak%20of%20Resistance1",
  longsword: "https://aonprd.com/EquipmentWeaponsDisplay.aspx?ItemName=Longsword",
  missing: "https://aonprd.com/MagicWondrousDisplay.aspx?FinalName=Nothing",
};

/** A listing of `name` at `url`, under a heading of items. */
function listed(name: string, url: string): Listing {
  return { heading: "Magic Items (Wondrous Items)", name, url };
}

/** The scraper of `book`, fetching the saved pages. */
function scraperOf(book: string) {
  return new BookOf(
    book,
    new SavedPages({
      [PAGES.cloak]: fixture("wondrous-cloak-of-resistance"),
      [PAGES.longsword]: fixture("weapon-longsword"),
      [PAGES.missing]: "<html><body><div id='main'><h1>Magic Items</h1></div></body></html>",
    }),
  );
}

/** The pages a test's scraper fetches, by URL: saved pages, never the site's. */
class SavedPages extends HttpClient {
  constructor(private readonly pages: Record<string, string>) {
    super({ cacheDir: join(tmpdir(), "pf1-saved-pages") });
  }

  override async fetchHtml(url: string): Promise<string> {
    const page = this.pages[url];
    if (page === undefined) throw new Error(`No saved page at ${url}`);
    return page;
  }
}

/** A book's scraper, which says whose an entry printed in `sources` is, and reads listed items' pages. */
class BookOf extends BaseScraper {
  linkOf(url: string) {
    return this.linkedUrl(url);
  }

  readItems(entries: Listing[]) {
    return this.readEntries(entries, (html) => new ItemPage(html).read());
  }

  whoseIs(sources: Printing[]) {
    return this.reprintOf(sources);
  }
}

describe("A book's scraper", () => {
  const longsword = [
    { book: "Ultimate Equipment", page: 18 },
    { book: "PRPG Core Rulebook", page: 142 },
  ];

  test("leaves an entry an earlier book printed to that book, whatever order its Source line names them in", () => {
    expect(scraperOf("ultimate-equipment").whoseIs(longsword)).toBe("core-rulebook");
    expect(scraperOf("ultimate-equipment").whoseIs([...longsword].reverse())).toBe("core-rulebook");
  });

  test("keeps an entry it printed first, or that only books it doesn't read printed before it", () => {
    expect(scraperOf("core-rulebook").whoseIs(longsword)).toBeUndefined();
    expect(
      scraperOf("advanced-race-guide").whoseIs([{ book: "Inner Sea Races" }, { book: "Advanced Race Guide" }]),
    ).toBeUndefined();
  });

  test("refuses a book it doesn't know, naming those it does", () => {
    expect(() => scraperOf("players-handbook").whoseIs(longsword)).toThrow(
      'Unknown book "players-handbook". Known books: core-rulebook',
    );
  });

  test("follows a link a book's page lists to the entry it means, where the site's link leads to none", () => {
    expect(
      scraperOf("core-rulebook").linkOf("https://aonprd.com/MagicWondrousDisplay.aspx?FinalName=Lens%20of%20Detection"),
    ).toBe("https://aonprd.com/MagicWondrousDisplay.aspx?FinalName=Lenses%20of%20Detection");
    const cloak = "https://aonprd.com/MagicWondrousDisplay.aspx?FinalName=Cloak%20of%20Resistance1";
    expect(scraperOf("core-rulebook").linkOf(cloak)).toBe(cloak);
  });

  test("reads each listed page once, with every name it's listed under, and leaves out a page it can't read", async () => {
    const read = await scraperOf("core-rulebook").readItems([
      listed("Cloak of Resistance (+1)", PAGES.cloak),
      listed("Nothing", PAGES.missing),
      listed("Cloak of Resistance (+2)", PAGES.cloak),
    ]);
    expect(read.map(({ reading }) => reading.name)).toEqual(["Cloak of Resistance"]);
    expect(read[0].listings.map(({ name }) => name)).toEqual(["Cloak of Resistance (+1)", "Cloak of Resistance (+2)"]);
  });

  test("leaves out what an earlier book printed, reading what it printed first", async () => {
    const longsword = listed("Longsword", PAGES.longsword);
    expect(await scraperOf("ultimate-equipment").readItems([longsword])).toEqual([]);
    expect((await scraperOf("core-rulebook").readItems([longsword])).map(({ reading }) => reading.name)).toEqual([
      "Longsword",
    ]);
  });
});
