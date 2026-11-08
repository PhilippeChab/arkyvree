import References from "@/codegen/dnd5/tools/references/References.ts";
import type { BaseScraper } from "@/codegen/dnd5/tools/scraper/BaseScraper.ts";
import type { ItemEntry } from "@/codegen/dnd5/tools/types/items.ts";
import type { Constructor } from "@/lib/mixins.ts";

/** Scraping the book's equipment: weapons, armor, gear, tools, mounts and vehicles into its item reference, read whole off the database's Equipment file. */
export function ScrapesItems<B extends Constructor<BaseScraper>>(Base: B) {
  abstract class ScrapingItems extends Base {
    /** Every one of the book's equipment: weapons, armor, gear, tools, mounts and vehicles. */
    async scrapeItems() {
      const datasets = { Equipment: await this.dataset<ItemEntry>("Equipment") };
      const outPath = References.path(this.book, "item");
      this.saveReference<"item">(outPath, this.datasetMeta("item", datasets), datasets["Equipment"].entries);
    }
  }
  return ScrapingItems;
}
