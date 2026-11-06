import { toCamelCase } from "@/codegen/core/text/names.ts";
import References from "@/codegen/pf1/tools/references/References.ts";
import { type BaseScraper } from "@/codegen/pf1/tools/scraper/BaseScraper.ts";
import { ClassPage } from "@/codegen/pf1/tools/scraper/pages/ClassPage.ts";
import type { Constructor } from "@/lib/mixins.ts";

/** The headings a book's page lists its classes under, each whether its classes are prestige classes. */
const CLASS_HEADINGS: Record<string, boolean> = { Classes: false, "Prestige Classes": true };

/** A class's file's name: its name in camel case, its parentheses dropped ("Barbarian (Unchained)": barbarianUnchained). */
function fileNameOf(name: string): string {
  return toCamelCase(name.replace(/[()]/g, " ").trim());
}

/** Scraping a book's classes (aonprd.com), base and prestige, each into a reference of its own. */
export function ScrapesClasses<B extends Constructor<BaseScraper>>(Base: B) {
  abstract class ScrapingClasses extends Base {
    /** A class's page, printed as it reads: no reference is written. */
    async scrapeClass(url: string) {
      const html = await this.http.fetchHtml(url);
      console.log(JSON.stringify(new ClassPage(html, undefined, url.includes("PrestigeClasses")).read(), null, 2));
    }

    /** Every class of the book, each in its own reference (`classes/<name>.json`), its page its source. */
    async scrapeClasses() {
      const { entries } = await this.listing(Object.keys(CLASS_HEADINGS));
      const classes = await this.readEntries(entries, (html, entry) =>
        new ClassPage(html, entry.name, CLASS_HEADINGS[entry.heading]).read(),
      );
      for (const { listings, reading } of classes) {
        const path = References.classPath(this.book, fileNameOf(reading.name));
        this.saveReference<"class">(path, this.meta("class", { sourceUrl: listings[0].url }), reading);
      }
    }
  }
  return ScrapingClasses;
}
