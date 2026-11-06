import References from "@/codegen/dnd5.2/tools/references/References.ts";
import type { BaseScraper } from "@/codegen/dnd5.2/tools/scraper/BaseScraper.ts";
import type { BackgroundEntry } from "@/codegen/dnd5.2/tools/types/backgrounds.ts";
import type { Constructor } from "@/lib/mixins.ts";

/** Scraping the book's backgrounds into its background reference, read whole off the database's Backgrounds file. */
export function ScrapesBackgrounds<B extends Constructor<BaseScraper>>(Base: B) {
  abstract class ScrapingBackgrounds extends Base {
    /** Every one of the book's backgrounds. */
    async scrapeBackgrounds() {
      const datasets = { Backgrounds: await this.dataset<BackgroundEntry>("Backgrounds") };
      const outPath = References.path(this.book, "background");
      this.saveReference<"background">(
        outPath,
        this.datasetMeta("background", datasets),
        datasets["Backgrounds"].entries,
      );
    }
  }
  return ScrapingBackgrounds;
}
