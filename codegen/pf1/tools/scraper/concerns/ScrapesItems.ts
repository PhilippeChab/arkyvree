import References from "@/codegen/pf1/tools/references/References.ts";
import { type BaseScraper } from "@/codegen/pf1/tools/scraper/BaseScraper.ts";
import { ItemPage } from "@/codegen/pf1/tools/scraper/pages/ItemPage.ts";
import type { ItemCategory } from "@/codegen/pf1/tools/types/items.ts";
import type { Constructor } from "@/lib/mixins.ts";

/** The headings a book's page lists its mundane items under, each its items' kind. */
const ITEM_HEADINGS: Record<string, ItemCategory> = {
  "Equipment (Weapons)": "weapon",
  "Equipment (Armor)": "armor",
  "Equipment (Misc.)": "goods",
};

/** Scraping a book's weapons, armor and goods (aonprd.com) into its item reference. */
export function ScrapesItems<B extends Constructor<BaseScraper>>(Base: B) {
  abstract class ScrapingItems extends Base {
    /** An item's page, mundane or magic, printed as it reads: no reference is written. */
    async scrapeItem(url: string) {
      console.log(JSON.stringify(new ItemPage(await this.http.fetchHtml(url)).read(), null, 2));
    }

    /** Every weapon, armor and good of the book, each page once, with the names the book lists it under. */
    async scrapeItems() {
      const { entries, url } = await this.listing(Object.keys(ITEM_HEADINGS));
      const items = await this.readEntries(entries, (html) => new ItemPage(html).read());
      const raw = items.map(({ listings, reading: { construction: _construction, ...item } }) => ({
        ...item,
        category: ITEM_HEADINGS[listings[0].heading],
        listedAs: [...new Set(listings.map(({ name }) => name))],
      }));
      this.saveReference<"item">(References.path(this.book, "item"), this.meta("item", { sourceUrl: url }), raw);
    }
  }
  return ScrapingItems;
}
