/**
 * `parser:dnd5:scrape`: the D&D 5th Edition book's reference of a type scraped from the 5e-bits database's files
 * (`ScrapeCommand`). Each type is read whole, off its files: `--url` doesn't apply.
 */

import { join } from "node:path";

import { ScrapeCommand } from "@/codegen/core/cli/ScrapeCommand.ts";
import { Scraper } from "@/codegen/dnd5/tools/scraper/Scraper.ts";
import { CORE_BOOK } from "@/vocabulary/dnd5/books.ts";

/** Where the scraper caches the files it fetches: its own folder's, which git ignores. */
const SCRAPER_CACHE = join(import.meta.dirname!, "../scraper/.cache");

const refusal = await new ScrapeCommand<Scraper>({
  cacheDir: SCRAPER_CACHE,
  command: "parser:dnd5:scrape",
  coreBook: CORE_BOOK,
  scraper: (book, http) => new Scraper(book, http),
  types: {
    background: { help: "The book's backgrounds", all: (scraper) => scraper.scrapeBackgrounds() },
    class: {
      help: "The book's classes, each with its levels, features and subclasses",
      all: (scraper) => scraper.scrapeClasses(),
    },
    feat: { help: "The book's feats", all: (scraper) => scraper.scrapeFeats() },
    item: {
      help: "The book's weapons, armor, gear, tools, mounts and vehicles",
      all: (scraper) => scraper.scrapeItems(),
    },
    magicItem: { help: "The book's magic items", all: (scraper) => scraper.scrapeMagicItems() },
    species: {
      help: "The book's species, each with its traits and subspecies",
      all: (scraper) => scraper.scrapeSpecies(),
    },
    spell: { help: "The book's spells", all: (scraper) => scraper.scrapeSpells() },
  },
}).run();
if (refusal) process.exitCode = 1;
