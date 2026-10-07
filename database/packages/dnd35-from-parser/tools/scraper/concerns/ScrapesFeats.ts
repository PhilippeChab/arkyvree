import References from "@/database/packages/dnd35-from-parser/tools/references/References.ts";
import { type BaseScraper } from "@/database/packages/dnd35-from-parser/tools/scraper/BaseScraper.ts";
import { FeatPage } from "@/database/packages/dnd35-from-parser/tools/scraper/pages/FeatPage.ts";
import { type FeatReference } from "@/database/packages/dnd35-from-parser/tools/types/feats.ts";
import type { Constructor } from "@/lib/mixins.ts";

/** Scraping a book's feats (dndtools.net) into its feat reference. */
export function ScrapesFeats<B extends Constructor<BaseScraper>>(Base: B) {
  abstract class ScrapingFeats extends Base {
    /** A feat's page, printed as it parses: no reference is written. */
    async scrapeFeat(url: string) {
      console.log(`Fetching ${url}...`);
      const html = await this.http.fetchHtml(url);
      const feat = new FeatPage(html).read();
      if (!feat) {
        console.error(`Could not parse feat from ${url}`);
        process.exit(1);
      }
      console.log(`Parsed: ${feat.name} [${feat.featType}]`);
      console.log(`  Prerequisite: ${feat.prerequisiteText || "(none)"}`);
      console.log(`  Benefit: ${feat.benefit.substring(0, 100)}...`);
      console.log(JSON.stringify(feat, null, 2));
    }

    /** Every feat of the book. */
    async scrapeFeats() {
      const { entries: featUrls, url: listingUrl } = await this.listing("feats");

      console.log(`Found ${featUrls.length} feats, fetching detail pages...`);

      const raw: FeatReference["raw"] = [];
      for (const entry of featUrls) {
        const html = await this.http.fetchHtml(entry.url);
        const feat = new FeatPage(html).read();
        if (feat) {
          raw.push(feat);
          console.log(`  ${feat.name} [${feat.featType}]`);
        } else {
          console.warn(`  SKIP: Could not parse ${entry.name} at ${entry.url}`);
        }
      }

      console.log(`Parsed ${raw.length} feats`);

      this.saveReference(References.path(this.book, "feat"), this.meta("feat", { sourceUrl: listingUrl }), raw);
    }
  }
  return ScrapingFeats;
}
