import References from "@/codegen/pf1/tools/references/References.ts";
import { type BaseScraper } from "@/codegen/pf1/tools/scraper/BaseScraper.ts";
import { ItemPage } from "@/codegen/pf1/tools/scraper/pages/ItemPage.ts";
import type { MagicItemCategory } from "@/codegen/pf1/tools/types/magicItems.ts";
import type { Constructor } from "@/lib/mixins.ts";

/** The headings a book's page lists its magic items under, each its items' kind. */
const MAGIC_ITEM_HEADINGS: Record<string, MagicItemCategory> = {
  "Magic Items (Armor)": "armor",
  "Magic Items (Weapons)": "weapon",
  "Magic Items (Rings)": "ring",
  "Magic Items (Rods)": "rod",
  "Magic Items (Staves)": "staff",
  "Magic Items (Wondrous Items)": "wondrous",
  "Magic Items (Artifacts)": "artifact",
  "Magic Items (Cursed Items)": "cursed",
};

/** Scraping a book's magic items (aonprd.com) into its magic item reference. */
export function ScrapesMagicItems<B extends Constructor<BaseScraper>>(Base: B) {
  abstract class ScrapingMagicItems extends Base {
    /** Every magic item of the book, each page once, with the names the book lists it under (one per bonus). */
    async scrapeMagicItems() {
      const { entries, url } = await this.listing(Object.keys(MAGIC_ITEM_HEADINGS));
      const items = await this.readEntries(entries, (html) => new ItemPage(html).read());
      const raw = items.map(({ listings, reading }) => ({
        ...reading,
        category: MAGIC_ITEM_HEADINGS[listings[0].heading],
        listedAs: [...new Set(listings.map(({ name }) => name))],
      }));
      const path = References.path(this.book, "magicItem");
      this.saveReference<"magicItem">(path, this.meta("magicItem", { sourceUrl: url }), raw);
    }
  }
  return ScrapingMagicItems;
}
