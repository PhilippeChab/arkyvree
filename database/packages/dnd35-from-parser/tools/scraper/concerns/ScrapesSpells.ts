import References from "@/database/packages/dnd35-from-parser/tools/references/References.ts";
import { type BaseScraper } from "@/database/packages/dnd35-from-parser/tools/scraper/BaseScraper.ts";
import { SpellPage } from "@/database/packages/dnd35-from-parser/tools/scraper/pages/SpellPage.ts";
import { type SpellReference } from "@/database/packages/dnd35-from-parser/tools/types/spells.ts";
import type { Constructor } from "@/lib/mixins.ts";

/** Scraping a book's spells (dndtools.net) into its spell reference. */
export function ScrapesSpells<B extends Constructor<BaseScraper>>(Base: B) {
  abstract class ScrapingSpells extends Base {
    /** A spell's page, printed as it parses: no reference is written. */
    async scrapeSpell(url: string) {
      console.log(`Fetching ${url}...`);
      const html = await this.http.fetchHtml(url);
      const spell = new SpellPage(html, url).read();
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
      const { entries: spellUrls, url: listingUrl } = await this.listing("spells");

      console.log(`Found ${spellUrls.length} spells, fetching detail pages...`);

      const raw: SpellReference["raw"] = [];
      for (const entry of spellUrls) {
        const html = await this.http.fetchHtml(entry.url);
        const spell = new SpellPage(html, entry.url).read();
        if (spell) raw.push(spell);
        else console.warn(`  SKIP: Could not parse ${entry.name} at ${entry.url}`);
      }

      console.log(`Parsed ${raw.length} spells`);

      const schools = new Map<string, number>();
      for (const spell of raw) schools.set(spell.school, (schools.get(spell.school) ?? 0) + 1);

      for (const [school, count] of [...schools.entries()].sort()) console.log(`  ${school}: ${count}`);

      this.saveReference(References.path(this.book, "spell"), this.meta("spell", { sourceUrl: listingUrl }), raw);
    }
  }
  return ScrapingSpells;
}
