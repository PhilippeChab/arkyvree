import References from "@/codegen/dnd5.2/tools/references/References.ts";
import type { BaseScraper } from "@/codegen/dnd5.2/tools/scraper/BaseScraper.ts";
import type { SpellEntry } from "@/codegen/dnd5.2/tools/types/spells.ts";
import type { Constructor } from "@/lib/mixins.ts";

/** Scraping the book's spells into its spell reference, read whole off the database's Spells file. */
export function ScrapesSpells<B extends Constructor<BaseScraper>>(Base: B) {
  abstract class ScrapingSpells extends Base {
    /** Every one of the book's spells. */
    async scrapeSpells() {
      const datasets = { Spells: await this.dataset<SpellEntry>("Spells") };
      const outPath = References.path(this.book, "spell");
      this.saveReference<"spell">(outPath, this.datasetMeta("spell", datasets), datasets["Spells"].entries);
    }
  }
  return ScrapingSpells;
}
