import References from "@/codegen/dnd3.5/tools/references/References.ts";
import { BaseScraper } from "@/codegen/dnd3.5/tools/scraper/BaseScraper.ts";
import { ClassPage } from "@/codegen/dnd3.5/tools/scraper/pages/class/ClassPage.ts";
import { toCamelCase } from "@/codegen/dnd3.5/tools/text/names.ts";
import type { Constructor } from "@/lib/mixins.ts";

/** Scraping a book's classes (dndtools.net): a reference per class. */
export function ScrapesClasses<B extends Constructor<BaseScraper>>(Base: B) {
  abstract class ScrapingClasses extends Base {
    /** A class's page, into its reference: the book's own page, else the class's page without the book. */
    async scrapeClass(url: string) {
      console.log(`Fetching ${url}...`);
      let html: string;
      try {
        html = await this.http.fetchHtml(url);
      } catch (error) {
        // If 404 and URL includes a book slug, try without it
        // e.g. /classes/complete-divine--52/spirit-shaman/ → /classes/spirit-shaman/
        if (error instanceof Error && error.message.includes("404")) {
          const slugMatch = url.match(/\/classes\/[^/]+\/([^/]+)\/?$/);
          if (slugMatch) {
            const fallbackUrl = `${BaseScraper.site}/classes/${slugMatch[1]}/`;
            console.log(`  404 — trying fallback: ${fallbackUrl}`);
            html = await this.http.fetchHtml(fallbackUrl);
            url = fallbackUrl; // Update for _meta.sourceUrl
          } else {
            throw error;
          }
        } else {
          throw error;
        }
      }
      console.log(`Parsing class HTML (${html.length} bytes)...`);

      const raw = new ClassPage(html).read();

      console.log(`Detected class: ${raw.name}`);
      console.log(`  Levels: ${raw.progression.length}`);
      console.log(`  Features: ${raw.classFeatures.length}`);

      const slug = toCamelCase(raw.name);
      const outPath = References.classPath(this.book, slug);

      const { detected } = this.saveResolvedReference(outPath, this.meta("class", { sourceUrl: url }), raw);
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
      // dndtools.net has no /classes/{book}/ listing: every book's classes are listed together
      const { entries: classUrls } = await this.listing("classes");

      console.log(`Found ${classUrls.length} classes`);

      for (const entry of classUrls) {
        console.log(`\n--- Scraping: ${entry.name} ---`);
        await this.scrapeClass(entry.url);
      }
    }
  }
  return ScrapingClasses;
}
