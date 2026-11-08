import References from "@/codegen/dnd5/tools/references/References.ts";
import type { BaseScraper } from "@/codegen/dnd5/tools/scraper/BaseScraper.ts";
import type { FeatEntry } from "@/codegen/dnd5/tools/types/feats.ts";
import type { Constructor } from "@/lib/mixins.ts";

/** Scraping the book's feats into its feat reference, read whole off the database's Feats file. */
export function ScrapesFeats<B extends Constructor<BaseScraper>>(Base: B) {
  abstract class ScrapingFeats extends Base {
    /** Every one of the book's feats. */
    async scrapeFeats() {
      const datasets = { Feats: await this.dataset<FeatEntry>("Feats") };
      const outPath = References.path(this.book, "feat");
      this.saveReference<"feat">(outPath, this.datasetMeta("feat", datasets), datasets["Feats"].entries);
    }
  }
  return ScrapingFeats;
}
