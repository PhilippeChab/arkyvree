import References from "@/codegen/pf1/tools/references/References.ts";
import { type BaseScraper } from "@/codegen/pf1/tools/scraper/BaseScraper.ts";
import { DomainPage } from "@/codegen/pf1/tools/scraper/pages/DomainPage.ts";
import type { Constructor } from "@/lib/mixins.ts";

/** The heading a book's page lists its subdomains under, each a section of its domain's page. */
const SUBDOMAINS = "Subdomains";

/** Scraping a book's domains and subdomains (aonprd.com) into its domain reference. */
export function ScrapesDomains<B extends Constructor<BaseScraper>>(Base: B) {
  abstract class ScrapingDomains extends Base {
    /** A domain's page, printed as it reads, its subdomains aside: no reference is written. */
    async scrapeDomain(url: string) {
      const page = new DomainPage(await this.http.fetchHtml(url));
      console.log(JSON.stringify(page.readDomain(page.title()), null, 2));
    }

    /** Every domain and subdomain of the book, its page its source: a subdomain is read off its domain's page. */
    async scrapeDomains() {
      const { entries, url } = await this.listing(["Cleric Domains", SUBDOMAINS]);
      const domains = await this.readEntries(entries, (html, entry) =>
        entry.heading === SUBDOMAINS
          ? new DomainPage(html).readSubdomain(entry.name)
          : new DomainPage(html).readDomain(entry.name),
      );
      const raw = domains.map(({ reading }) => reading);
      this.saveReference<"domain">(References.path(this.book, "domain"), this.meta("domain", { sourceUrl: url }), raw);
    }
  }
  return ScrapingDomains;
}
