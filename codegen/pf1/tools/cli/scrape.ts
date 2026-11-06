/**
 * `parser:pf1:scrape`: a Pathfinder 1 book's reference of a type scraped, or one page of it printed: no reference is
 * written for one page (`ScrapeCommand`).
 */

import { join } from "node:path";

import { ScrapeCommand } from "@/codegen/core/cli/ScrapeCommand.ts";
import { Scraper } from "@/codegen/pf1/tools/scraper/Scraper.ts";
import { CORE_BOOK } from "@/vocabulary/pf1/books.ts";

/** Where the scraper caches the pages it fetches: its own folder's, which git ignores. */
const SCRAPER_CACHE = join(import.meta.dirname!, "../scraper/.cache");

const refusal = await new ScrapeCommand<Scraper>({
  cacheDir: SCRAPER_CACHE,
  command: "parser:pf1:scrape",
  coreBook: CORE_BOOK,
  scraper: (book, http) => new Scraper(book, http),
  types: {
    class: {
      help: "A book's classes, base and prestige; --url: one page, printed",
      all: (scraper) => scraper.scrapeClasses(),
      one: (scraper, url) => scraper.scrapeClass(url),
    },
    domain: {
      help: "A book's domains and subdomains; --url: one page, printed",
      all: (scraper) => scraper.scrapeDomains(),
      one: (scraper, url) => scraper.scrapeDomain(url),
    },
    feat: {
      help: "A book's feats; --url: one page, printed",
      all: (scraper) => scraper.scrapeFeats(),
      one: (scraper, url) => scraper.scrapeFeat(url),
    },
    item: {
      help: "A book's weapons, armor and goods; --url: one page, printed",
      all: (scraper) => scraper.scrapeItems(),
      one: (scraper, url) => scraper.scrapeItem(url),
    },
    magicItem: {
      help: "A book's magic items; --url: one page, printed",
      all: (scraper) => scraper.scrapeMagicItems(),
      one: (scraper, url) => scraper.scrapeItem(url),
    },
    race: {
      help: "A book's races; --url: one page, printed",
      all: (scraper) => scraper.scrapeRaces(),
      one: (scraper, url) => scraper.scrapeRace(url),
    },
    spell: {
      help: "A book's spells; --url: one page, printed",
      all: (scraper) => scraper.scrapeSpells(),
      one: (scraper, url) => scraper.scrapeSpell(url),
    },
  },
}).run();
if (refusal) process.exitCode = 1;
