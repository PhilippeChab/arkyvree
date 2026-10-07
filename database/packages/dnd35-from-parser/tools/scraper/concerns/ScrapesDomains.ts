import References from "@/database/packages/dnd35-from-parser/tools/references/References.ts";
import { type BaseScraper } from "@/database/packages/dnd35-from-parser/tools/scraper/BaseScraper.ts";
import { DomainIndexPage } from "@/database/packages/dnd35-from-parser/tools/scraper/pages/DomainIndexPage.ts";
import { DomainPage } from "@/database/packages/dnd35-from-parser/tools/scraper/pages/DomainPage.ts";
import { SpellDomainsPage } from "@/database/packages/dnd35-from-parser/tools/scraper/pages/SpellDomainsPage.ts";
import type { DomainVersionSpell } from "@/database/packages/dnd35-from-parser/tools/types/domains.ts";
import type { Constructor } from "@/lib/mixins.ts";

/** dndtools' domains as its copy at dnd.arkalseif.info keeps them: a page per book's version (`DomainPage`). */
const DOMAIN_SITE = "https://dnd.arkalseif.info/spells";

const DOMAIN_INDEX_URL = `${DOMAIN_SITE}/domains/index.html`;

/** Scraping a book's domains, from dndtools' database as its copy at dnd.arkalseif.info keeps them. */
export function ScrapesDomains<B extends Constructor<BaseScraper>>(Base: B) {
  abstract class ScrapingDomains extends Base {
    /** A page of the domain index: the copy keeps page N as `index.html?page=N`, its `?` escaped. */
    private domainIndexPageUrl(page: number) {
      return page === 1 ? DOMAIN_INDEX_URL : `${DOMAIN_INDEX_URL}%3Fpage=${page}`;
    }

    /** Every domain version of the index, with its page. */
    private async fetchDomainPages() {
      const first = new DomainIndexPage(await this.http.fetchHtml(this.domainIndexPageUrl(1))).read();
      const entries = [...first.entries];
      for (let page = 2; entries.length < first.total; page++) {
        const { entries: more } = new DomainIndexPage(await this.http.fetchHtml(this.domainIndexPageUrl(page))).read();
        if (more.length === 0) break;
        entries.push(...more);
      }
      const pages = [];
      for (const entry of entries) {
        pages.push({
          ...entry,
          ...new DomainPage(await this.http.fetchHtml(`${DOMAIN_SITE}/domains/${entry.slug}/index.html`)).read(),
        });
      }
      return pages;
    }

    /**
     * A book's domains as it prints them: each version whose page names the book, with its granted power and its 3.5
     * spells at their level there. Its spells are those its page lists and those of the domain's other versions (a
     * page of the copy can miss some), each kept at the level its own page gives this version.
     */
    async scrapeDomains() {
      const bookSlug = this.bookSlug();
      const pages = await this.fetchDomainPages();
      // A version whose page names no book (Glory (CD)'s) is the book's when its label ends with the book's code, the
      // code ("CD") the versions that name the book end with
      const codes = new Set(
        pages.filter((page) => page.bookSlug === bookSlug).map((page) => DomainPage.bookCodeOf(page.label)),
      );
      codes.delete(undefined);
      const versions = pages.filter(
        (page) => page.bookSlug === bookSlug || (!page.bookSlug && codes.has(DomainPage.bookCodeOf(page.label))),
      );
      const bookless = pages.filter((page) => !page.bookSlug && !versions.includes(page)).length;
      console.log(
        `${versions.length} of ${pages.length} domain versions are ${this.book}'s; ${bookless} others name no book`,
      );

      const raw = [];
      for (const version of versions) {
        const name = DomainPage.nameOf(version.label);
        const candidates = new Map<string, DomainVersionSpell>();
        for (const page of pages.filter((p) => DomainPage.nameOf(p.label) === name))
          for (const spell of page.spells) if (spell.edition.includes("3.5")) candidates.set(spell.path, spell);

        const spells = [];
        for (const spell of candidates.values()) {
          const levels = new SpellDomainsPage(
            await this.http.fetchHtml(`${DOMAIN_SITE}/${spell.path}/index.html`),
          ).levels();
          const level = levels.get(version.slug);
          if (level !== undefined) spells.push({ name: spell.name, level });
        }
        spells.sort((a, b) => a.level - b.level || a.name.localeCompare(b.name));
        raw.push({ name, ...(version.page ? { page: version.page } : {}), description: version.description, spells });
        console.log(`  ${version.label}: ${spells.length} spells`);
      }
      if (raw.length === 0) {
        console.log(`No domain of ${this.book}: no reference written`);
        return;
      }

      this.saveReference(
        References.path(this.book, "domain"),
        this.meta("domain", { sourceUrl: DOMAIN_INDEX_URL }),
        raw,
      );
    }
  }
  return ScrapingDomains;
}
