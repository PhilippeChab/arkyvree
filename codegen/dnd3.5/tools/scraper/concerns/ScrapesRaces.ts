import References from "@/codegen/dnd3.5/tools/references/References.ts";
import { type BaseScraper } from "@/codegen/dnd3.5/tools/scraper/BaseScraper.ts";
import { RacePage } from "@/codegen/dnd3.5/tools/scraper/pages/RacePage.ts";
import { type RaceReference } from "@/codegen/dnd3.5/tools/types/races.ts";
import type { Constructor } from "@/lib/mixins.ts";

/** Scraping a book's races (dndtools.net) into its race reference. */
export function ScrapesRaces<B extends Constructor<BaseScraper>>(Base: B) {
  abstract class ScrapingRaces extends Base {
    /** A race's page, printed as it parses: no reference is written. */
    async scrapeRace(url: string) {
      console.log(`Fetching ${url}...`);
      const html = await this.http.fetchHtml(url);
      const race = new RacePage(html).read();
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
      const { entries: raceUrls, url: listingUrl } = await this.listing("races");

      console.log(`Found ${raceUrls.length} races`);

      const raw: RaceReference["raw"] = [];
      for (const entry of raceUrls) {
        console.log(`  Fetching: ${entry.name}...`);
        const html = await this.http.fetchHtml(entry.url);
        const race = new RacePage(html).read();
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

      this.saveReference(References.path(this.book, "race"), this.meta("race", { sourceUrl: listingUrl }), raw);
    }
  }
  return ScrapingRaces;
}
