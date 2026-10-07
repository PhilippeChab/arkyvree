import { include } from "@/lib/mixins.ts";

import { BaseScraper } from "./BaseScraper.ts";
import { ScrapesClasses } from "./concerns/ScrapesClasses.ts";
import { ScrapesDomains } from "./concerns/ScrapesDomains.ts";
import { ScrapesFeats } from "./concerns/ScrapesFeats.ts";
import { ScrapesItems } from "./concerns/ScrapesItems.ts";
import { ScrapesMagicItems } from "./concerns/ScrapesMagicItems.ts";
import { ScrapesRaces } from "./concerns/ScrapesRaces.ts";
import { ScrapesSpells } from "./concerns/ScrapesSpells.ts";

/**
 * Scrapes a book's pages into its references: a concern per kind of reference (`concerns/`), each reading the pages
 * with its page (`pages/`) and saving what it read, the reference's overrides kept.
 */
export class Scraper extends include(
  BaseScraper,
  ScrapesClasses,
  ScrapesDomains,
  ScrapesFeats,
  ScrapesItems,
  ScrapesMagicItems,
  ScrapesRaces,
  ScrapesSpells,
) {}
