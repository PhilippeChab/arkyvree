import { REFERENCE_FILE_NAMES } from "@/database/packages/dnd35-from-parser/tools/references/files.ts";
import { type BaseScraper } from "@/database/packages/dnd35-from-parser/tools/scraper/BaseScraper.ts";
import { buildListingUrl } from "@/database/packages/dnd35-from-parser/tools/scraper/books.ts";
import { parseSpellDetailHtml } from "@/database/packages/dnd35-from-parser/tools/scraper/parsers/spell.ts";
import { type SpellReference } from "@/database/packages/dnd35-from-parser/tools/types/spells.ts";
import type { Constructor } from "@/server/mixins.ts";

/** Scraping a book's spells (dndtools.net) into its spell reference. */
export function ScrapesSpells<B extends Constructor<BaseScraper>>(Base: B) {
  abstract class ScrapingSpells extends Base {
    /** A spell's page, printed as it parses: no reference is written. */
    async scrapeSpell(url: string) {
      console.log(`Fetching ${url}...`);
      const html = await this.http.fetchHtml(url);
      const spell = parseSpellDetailHtml(html, url);
      if (!spell) {
        console.error(`Could not parse spell from ${url}`);
        process.exit(1);
      }
      console.log(`Parsed: ${spell.name} (${spell.school})`);
      console.log(`  Level: ${spell.levelEntries.map((e) => `${e.className} ${e.level}`).join(", ")}`);
      console.log(JSON.stringify(spell, null, 2));
    }

    /** Every spell of the book. */
    async scrapeSpells() {
      const listingUrl = buildListingUrl("spells", this.book);
      console.log(`Discovering spells from ${listingUrl}...`);

      const spellUrls = await this.discover(listingUrl, "spells");

      console.log(`Found ${spellUrls.length} spells, fetching detail pages...`);

      const raw: SpellReference["raw"] = [];
      for (const entry of spellUrls) {
        const html = await this.http.fetchHtml(entry.url);
        const spell = parseSpellDetailHtml(html, entry.url);
        if (spell) {
          raw.push(spell);
        } else {
          console.warn(`  SKIP: Could not parse ${entry.name} at ${entry.url}`);
        }
      }

      console.log(`Parsed ${raw.length} spells`);

      const schools = new Map<string, number>();
      for (const spell of raw) {
        schools.set(spell.school, (schools.get(spell.school) ?? 0) + 1);
      }
      for (const [school, count] of [...schools.entries()].sort()) {
        console.log(`  ${school}: ${count}`);
      }

      const outPath = this.referencePath(REFERENCE_FILE_NAMES.spell);

      this.saveReference(
        outPath,
        {
          type: "spell",
          sourceUrl: listingUrl,
          book: this.book,
          scrapedAt: new Date().toISOString(),
        },
        raw,
      );
    }
  }
  return ScrapingSpells;
}
