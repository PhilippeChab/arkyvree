import References from "@/codegen/pf1/tools/references/References.ts";
import { type BaseScraper } from "@/codegen/pf1/tools/scraper/BaseScraper.ts";
import { RacePage } from "@/codegen/pf1/tools/scraper/pages/RacePage.ts";
import type { Constructor } from "@/lib/mixins.ts";

/** Scraping a book's races (aonprd.com) into its race reference. */
export function ScrapesRaces<B extends Constructor<BaseScraper>>(Base: B) {
  abstract class ScrapingRaces extends Base {
    /** A race's page, printed as it reads: no reference is written. */
    async scrapeRace(url: string) {
      console.log(JSON.stringify(new RacePage(await this.http.fetchHtml(url)).read(), null, 2));
    }

    /** Every race of the book, its page its source. */
    async scrapeRaces() {
      const { entries, url } = await this.listing(["Races"]);
      const races = await this.readEntries(entries, (html, entry) => new RacePage(html, entry.name).read());
      const raw = races.map(({ reading }) => reading);
      this.saveReference<"race">(References.path(this.book, "race"), this.meta("race", { sourceUrl: url }), raw);
    }
  }
  return ScrapingRaces;
}
