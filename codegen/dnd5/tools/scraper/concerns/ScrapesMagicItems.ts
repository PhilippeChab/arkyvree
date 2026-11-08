import References from "@/codegen/dnd5/tools/references/References.ts";
import type { BaseScraper } from "@/codegen/dnd5/tools/scraper/BaseScraper.ts";
import type { MagicItemEntry } from "@/codegen/dnd5/tools/types/magicItems.ts";
import type { Constructor } from "@/lib/mixins.ts";

/** Scraping the book's magic items into its magic item reference, read whole off the database's Magic-Items file. */
export function ScrapesMagicItems<B extends Constructor<BaseScraper>>(Base: B) {
  abstract class ScrapingMagicItems extends Base {
    /** Every one of the book's magic items. */
    async scrapeMagicItems() {
      const datasets = { "Magic-Items": await this.dataset<MagicItemEntry>("Magic-Items") };
      const outPath = References.path(this.book, "magicItem");
      this.saveReference<"magicItem">(
        outPath,
        this.datasetMeta("magicItem", datasets),
        datasets["Magic-Items"].entries,
      );
    }
  }
  return ScrapingMagicItems;
}
