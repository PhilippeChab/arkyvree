import { include } from "@/lib/mixins.ts";

import { BaseScraper } from "./BaseScraper.ts";
import { ScrapesBackgrounds } from "./concerns/ScrapesBackgrounds.ts";
import { ScrapesClasses } from "./concerns/ScrapesClasses.ts";
import { ScrapesFeats } from "./concerns/ScrapesFeats.ts";
import { ScrapesItems } from "./concerns/ScrapesItems.ts";
import { ScrapesMagicItems } from "./concerns/ScrapesMagicItems.ts";
import { ScrapesSpecies } from "./concerns/ScrapesSpecies.ts";
import { ScrapesSpells } from "./concerns/ScrapesSpells.ts";

/**
 * Scrapes the D&D 5th Edition book (the 5e-bits database's SRD 5.2.1 files) into its references: a concern per kind
 * of reference (`concerns/`), each reading the files it's gathered from and saving what it read, the reference's
 * overrides kept.
 */
export class Scraper extends include(
  BaseScraper,
  ScrapesBackgrounds,
  ScrapesClasses,
  ScrapesFeats,
  ScrapesItems,
  ScrapesMagicItems,
  ScrapesSpecies,
  ScrapesSpells,
) {}
