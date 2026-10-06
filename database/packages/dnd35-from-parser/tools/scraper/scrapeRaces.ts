/** Scrapes a book's races (dndtools.net) into its race reference. */

import { join } from "node:path";

import { buildRaceListingUrl, getBookSlug } from "@/database/packages/dnd35-from-parser/tools/scraper/books.ts";
import { fetchHtml } from "@/database/packages/dnd35-from-parser/tools/scraper/http.ts";
import { discover } from "@/database/packages/dnd35-from-parser/tools/scraper/listingEntries.ts";
import { parseRaceDetailHtml } from "@/database/packages/dnd35-from-parser/tools/scraper/parsers/race.ts";
import { saveReference } from "@/database/packages/dnd35-from-parser/tools/scraper/saveReference.ts";
import { REFERENCE_DIR } from "@/database/packages/dnd35-from-parser/tools/shared.ts";
import { type RaceReference } from "@/database/packages/dnd35-from-parser/tools/types.ts";

export async function scrapeAllRaces(book: string) {
  const bookSlug = getBookSlug(book);
  const listingUrl = buildRaceListingUrl(book);
  console.log(`Discovering races from ${listingUrl} (filtering for ${bookSlug})...`);

  const raceUrls = await discover(listingUrl, "races", bookSlug);

  console.log(`Found ${raceUrls.length} races`);

  const raw: RaceReference["raw"] = [];
  for (const entry of raceUrls) {
    console.log(`  Fetching: ${entry.name}...`);
    const html = await fetchHtml(entry.url);
    const race = parseRaceDetailHtml(html);
    if (race) {
      raw.push(race);
      const adjStr =
        race.abilityAdjustments.map((a) => `${a.ability} ${a.value > 0 ? "+" : ""}${a.value}`).join(", ") || "(none)";
      console.log(`    ${race.name}: ${race.size}, speed ${race.baseSpeed}, ${adjStr}`);
    } else {
      console.warn(`    SKIP: Could not parse ${entry.name} at ${entry.url}`);
    }
  }

  console.log(`Parsed ${raw.length} races`);

  const outPath = join(REFERENCE_DIR, book, "races.json");

  saveReference(
    outPath,
    {
      type: "race",
      sourceUrl: listingUrl,
      book,
      scrapedAt: new Date().toISOString(),
    },
    raw,
  );
}

export async function scrapeSingleRace(url: string) {
  console.log(`Fetching ${url}...`);
  const html = await fetchHtml(url);
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
