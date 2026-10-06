import { BaseScraper } from "@/database/packages/dnd35-from-parser/tools/scraper/BaseScraper.ts";
import { ScrapesClasses } from "@/database/packages/dnd35-from-parser/tools/scraper/concerns/ScrapesClasses.ts";
import { ScrapesDomains } from "@/database/packages/dnd35-from-parser/tools/scraper/concerns/ScrapesDomains.ts";
import { ScrapesFeats } from "@/database/packages/dnd35-from-parser/tools/scraper/concerns/ScrapesFeats.ts";
import { ScrapesItems } from "@/database/packages/dnd35-from-parser/tools/scraper/concerns/ScrapesItems.ts";
import { ScrapesMagicItems } from "@/database/packages/dnd35-from-parser/tools/scraper/concerns/ScrapesMagicItems.ts";
import { ScrapesRaces } from "@/database/packages/dnd35-from-parser/tools/scraper/concerns/ScrapesRaces.ts";
import { ScrapesSpells } from "@/database/packages/dnd35-from-parser/tools/scraper/concerns/ScrapesSpells.ts";
import { include } from "@/server/mixins.ts";

/**
 * Scrapes a book's pages into its references: a concern per kind of reference (`concerns/`), each reading the pages
 * with its parser (`parsers/`) and saving what it read, the reference's overrides kept.
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
