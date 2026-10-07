import { type BaseScraper } from "@/database/packages/dnd35-from-parser/tools/scraper/BaseScraper.ts";
import { BASE_URL } from "@/database/packages/dnd35-from-parser/tools/scraper/books.ts";
import { parseClassHtml } from "@/database/packages/dnd35-from-parser/tools/scraper/parsers/class/classPage.ts";
import { toCamelCase } from "@/database/packages/dnd35-from-parser/tools/text/names.ts";
import type { Constructor } from "@/server/mixins.ts";

/** Scraping a book's classes (dndtools.net): a reference per class. */
export function ScrapesClasses<B extends Constructor<BaseScraper>>(Base: B) {
  abstract class ScrapingClasses extends Base {
    /** A class's page, into its reference: the book's own page, else the class's page without the book. */
    async scrapeClass(url: string) {
      console.log(`Fetching ${url}...`);
      let html: string;
      try {
        html = await this.http.fetchHtml(url);
      } catch (err) {
        // If 404 and URL includes a book slug, try without it
        // e.g. /classes/complete-divine--52/spirit-shaman/ → /classes/spirit-shaman/
        if (err instanceof Error && err.message.includes("404")) {
          const slugMatch = url.match(/\/classes\/[^/]+\/([^/]+)\/?$/);
          if (slugMatch) {
            const fallbackUrl = `${BASE_URL}/classes/${slugMatch[1]}/`;
            console.log(`  404 — trying fallback: ${fallbackUrl}`);
            html = await this.http.fetchHtml(fallbackUrl);
            url = fallbackUrl; // Update for _meta.sourceUrl
          } else {
            throw err;
          }
        } else {
          throw err;
        }
      }
      console.log(`Parsing class HTML (${html.length} bytes)...`);

      const { _meta, ...raw } = parseClassHtml(html, url, this.book);

      console.log(`Detected class: ${raw.name}`);
      console.log(`  Levels: ${raw.progression.length}`);
      console.log(`  Features: ${raw.classFeatures.length}`);

      const slug = toCamelCase(raw.name);
      const outPath = this.referencePath("classes", `${slug}.json`);

      const { detected } = this.saveResolvedReference(outPath, _meta, raw);
      console.log(`  BAB: ${detected.bab}`);
      console.log(`  Saves: fort=${detected.saves.fortitude} ref=${detected.saves.reflex} will=${detected.saves.will}`);
      if (detected.casterLevelAdvancement) {
        console.log(
          `  Caster advancement: ${detected.casterLevelAdvancement.type} at levels ${detected.casterLevelAdvancement.levels.join(", ")}`,
        );
      }
    }

    /** Every class of the book. */
    async scrapeClasses() {
      // dndtools.net doesn't support /classes/{book}/ URLs — use the full listing
      // and filter by book slug in the class URL path
      const bookSlug = this.bookSlug();
      const listingUrl = `${BASE_URL}/classes/`;
      console.log(`Discovering classes from ${listingUrl} (filtering for ${bookSlug})...`);

      const classUrls = await this.discover(listingUrl, "classes", bookSlug);

      console.log(`Found ${classUrls.length} classes`);

      for (const entry of classUrls) {
        console.log(`\n--- Scraping: ${entry.name} ---`);
        await this.scrapeClass(entry.url);
      }
    }
  }
  return ScrapingClasses;
}
