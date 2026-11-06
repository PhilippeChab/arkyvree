import References from "@/codegen/pf1/tools/references/References.ts";
import { type BaseScraper } from "@/codegen/pf1/tools/scraper/BaseScraper.ts";
import { FeatPage } from "@/codegen/pf1/tools/scraper/pages/FeatPage.ts";
import type { Constructor } from "@/lib/mixins.ts";

/** Scraping a book's feats (aonprd.com) into its feat reference. */
export function ScrapesFeats<B extends Constructor<BaseScraper>>(Base: B) {
  abstract class ScrapingFeats extends Base {
    /** A feat's page, printed as it reads: no reference is written. */
    async scrapeFeat(url: string) {
      console.log(JSON.stringify(new FeatPage(await this.http.fetchHtml(url)).read(), null, 2));
    }

    /** Every feat of the book, its page its source. */
    async scrapeFeats() {
      const { entries, url } = await this.listing(["Feats"]);
      const feats = await this.readEntries(entries, (html, entry) => new FeatPage(html, entry.name).read());
      const raw = feats.map(({ reading }) => reading);
      this.saveReference<"feat">(References.path(this.book, "feat"), this.meta("feat", { sourceUrl: url }), raw);
    }
  }
  return ScrapingFeats;
}
