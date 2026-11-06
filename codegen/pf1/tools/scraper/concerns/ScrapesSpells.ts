import References from "@/codegen/pf1/tools/references/References.ts";
import { type BaseScraper } from "@/codegen/pf1/tools/scraper/BaseScraper.ts";
import { SpellPage } from "@/codegen/pf1/tools/scraper/pages/SpellPage.ts";
import type { Constructor } from "@/lib/mixins.ts";

/** Scraping a book's spells (aonprd.com) into its spell reference. */
export function ScrapesSpells<B extends Constructor<BaseScraper>>(Base: B) {
  abstract class ScrapingSpells extends Base {
    /** A spell's page, printed as it reads: no reference is written. */
    async scrapeSpell(url: string) {
      console.log(JSON.stringify(new SpellPage(await this.http.fetchHtml(url)).read(), null, 2));
    }

    /** Every spell of the book, its page its source. */
    async scrapeSpells() {
      const { entries, url } = await this.listing(["Spells"]);
      const spells = await this.readEntries(entries, (html, entry) => new SpellPage(html, entry.name).read());
      const raw = spells.map(({ reading }) => reading);
      this.saveReference<"spell">(References.path(this.book, "spell"), this.meta("spell", { sourceUrl: url }), raw);
    }
  }
  return ScrapingSpells;
}
