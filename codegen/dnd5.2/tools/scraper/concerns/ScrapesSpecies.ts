import References from "@/codegen/dnd5.2/tools/references/References.ts";
import type { BaseScraper } from "@/codegen/dnd5.2/tools/scraper/BaseScraper.ts";
import { groupSpecies } from "@/codegen/dnd5.2/tools/scraper/datasets.ts";
import type { Constructor } from "@/lib/mixins.ts";

/** Scraping the book's species into its species reference, each with its traits and subspecies read whole. */
export function ScrapesSpecies<B extends Constructor<BaseScraper>>(Base: B) {
  abstract class ScrapingSpecies extends Base {
    /** Every species of the book. */
    async scrapeSpecies() {
      const datasets = {
        Species: await this.dataset<Parameters<typeof groupSpecies>[0][number]>("Species"),
        Subspecies: await this.dataset<Parameters<typeof groupSpecies>[1][number]>("Subspecies"),
        Traits: await this.dataset<Parameters<typeof groupSpecies>[2][number]>("Traits"),
      };
      const raw = groupSpecies(datasets.Species.entries, datasets.Subspecies.entries, datasets.Traits.entries);
      this.saveReference<"species">(References.path(this.book, "species"), this.datasetMeta("species", datasets), raw);
    }
  }
  return ScrapingSpecies;
}
