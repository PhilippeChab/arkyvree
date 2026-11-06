/** `parser:dnd3.5:scrape`: a 3.5 book's reference of a type, or one page of it, scraped (`ScrapeCommand`). */

import { join } from "node:path";

import { ScrapeCommand } from "@/codegen/core/cli/ScrapeCommand.ts";
import { Scraper } from "@/codegen/dnd3.5/tools/scraper/Scraper.ts";
import { sanitizeHtml } from "@/codegen/dnd3.5/tools/text/sanitize.ts";
import { CORE_BOOK } from "@/vocabulary/dnd3.5/books.ts";

/** Where the scraper caches the pages it fetches: its own folder's, which git ignores. */
const SCRAPER_CACHE = join(import.meta.dirname!, "../scraper/.cache");

const refusal = await new ScrapeCommand<Scraper>({
  cacheDir: SCRAPER_CACHE,
  command: "parser:dnd3.5:scrape",
  coreBook: CORE_BOOK,
  sanitize: sanitizeHtml,
  scraper: (book, http) => new Scraper(book, http),
  types: {
    class: {
      help: "A book's classes (dndtools.net); --url: one class's page, into its reference",
      all: (scraper) => scraper.scrapeClasses(),
      one: (scraper, url) => scraper.scrapeClass(url),
    },
    feat: {
      help: "A book's feats (dndtools.net); --url: one feat's page, printed",
      all: (scraper) => scraper.scrapeFeats(),
      one: (scraper, url) => scraper.scrapeFeat(url),
    },
    spell: {
      help: "A book's spells (dndtools.net); --url: one spell's page, printed",
      all: (scraper) => scraper.scrapeSpells(),
      one: (scraper, url) => scraper.scrapeSpell(url),
    },
    domain: {
      help: "A book's domains (dndtools' copy at dnd.arkalseif.info)",
      all: (scraper) => scraper.scrapeDomains(),
    },
    race: {
      help: "A book's races (dndtools.net); --url: one race's page, printed",
      all: (scraper) => scraper.scrapeRaces(),
      one: (scraper, url) => scraper.scrapeRace(url),
    },
    item: { help: "The SRD's weapons, armor and goods (d20srd.org)", all: (scraper) => scraper.scrapeItems() },
    magicItem: { help: "A book's magic items (d20srd.org)", all: (scraper) => scraper.scrapeMagicItems() },
    wizardSchool: {
      help: "Wizard schools: no page reads them, their reference is maintained by hand",
      all: async () => console.log("Skipping wizardSchool — no HTML parser (reference is manually maintained)"),
    },
  },
}).run();
if (refusal) process.exitCode = 1;
