import { type BaseScraper } from "@/database/packages/dnd35-from-parser/tools/scraper/BaseScraper.ts";
import { buildRaceListingUrl } from "@/database/packages/dnd35-from-parser/tools/scraper/books.ts";
import { parseRaceDetailHtml } from "@/database/packages/dnd35-from-parser/tools/scraper/parsers/race.ts";
import { type RaceReference } from "@/database/packages/dnd35-from-parser/tools/types/races.ts";
import type { Constructor } from "@/server/mixins.ts";

/** Scraping a book's races (dndtools.net) into its race reference. */
export function ScrapesRaces<B extends Constructor<BaseScraper>>(Base: B) {
  abstract class ScrapingRaces extends Base {
    /** A race's page, printed as it parses: no reference is written. */
    async scrapeRace(url: string) {
      console.log(`Fetching ${url}...`);
      const html = await this.http.fetchHtml(url);
      const race = parseRaceDetailHtml(html);
      if (!race) {
        console.error(`Could not parse race from ${url}`);
        process.exit(1);
      }
      console.log(`Parsed: ${race.name} (${race.size}, speed ${race.baseSpeed})`);
      console.log(
        `  Abilities: ${race.abilityAdjustments.map((a) => `${a.ability} ${a.value > 0 ? "+" : ""}${a.value}`).join(", ") || "(none)"}`,
      );
      if (race.favoredClass) console.log(`  Favored class: ${race.favoredClass}`);
      console.log(`  Features: ${race.features.length}`);
      console.log(JSON.stringify(race, null, 2));
    }

    /** Every race of the book. */
    async scrapeRaces() {
      const bookSlug = this.bookSlug();
      const listingUrl = buildRaceListingUrl(this.book);
      console.log(`Discovering races from ${listingUrl} (filtering for ${bookSlug})...`);

      const raceUrls = await this.discover(listingUrl, "races", bookSlug);

      console.log(`Found ${raceUrls.length} races`);

      const raw: RaceReference["raw"] = [];
      for (const entry of raceUrls) {
        console.log(`  Fetching: ${entry.name}...`);
        const html = await this.http.fetchHtml(entry.url);
        const race = parseRaceDetailHtml(html);
        if (race) {
          raw.push(race);
          const adjStr =
            race.abilityAdjustments.map((a) => `${a.ability} ${a.value > 0 ? "+" : ""}${a.value}`).join(", ") ||
            "(none)";
          console.log(`    ${race.name}: ${race.size}, speed ${race.baseSpeed}, ${adjStr}`);
        } else {
          console.warn(`    SKIP: Could not parse ${entry.name} at ${entry.url}`);
        }
      }

      console.log(`Parsed ${raw.length} races`);

      const outPath = this.referencePath("races.json");

      this.saveReference(
        outPath,
        {
          type: "race",
          sourceUrl: listingUrl,
          book: this.book,
          scrapedAt: new Date().toISOString(),
        },
        raw,
      );
    }
  }
  return ScrapingRaces;
}
