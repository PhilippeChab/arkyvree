/** Scrapes a book's spells (dndtools.net) into its spell reference. */

import { join } from "node:path";

import { REFERENCE_DIR } from "@/database/packages/dnd35-from-parser/tools/referenceFiles.ts";
import { buildListingUrl } from "@/database/packages/dnd35-from-parser/tools/scraper/books.ts";
import { fetchHtml } from "@/database/packages/dnd35-from-parser/tools/scraper/http.ts";
import { discover } from "@/database/packages/dnd35-from-parser/tools/scraper/listingEntries.ts";
import { parseSpellDetailHtml } from "@/database/packages/dnd35-from-parser/tools/scraper/parsers/spell.ts";
import { saveReference } from "@/database/packages/dnd35-from-parser/tools/scraper/saveReference.ts";
import { type SpellReference } from "@/database/packages/dnd35-from-parser/tools/types/spells.ts";

export async function scrapeAllSpells(book: string) {
  const listingUrl = buildListingUrl("spells", book);
  console.log(`Discovering spells from ${listingUrl}...`);

  const spellUrls = await discover(listingUrl, "spells");

  console.log(`Found ${spellUrls.length} spells, fetching detail pages...`);

  const raw: SpellReference["raw"] = [];
  for (const entry of spellUrls) {
    const html = await fetchHtml(entry.url);
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

  const outPath = join(REFERENCE_DIR, book, "spells.json");

  saveReference(
    outPath,
    {
      type: "spell",
      sourceUrl: listingUrl,
      book,
      scrapedAt: new Date().toISOString(),
    },
    raw,
  );
}

export async function scrapeSingleSpell(url: string) {
  console.log(`Fetching ${url}...`);
  const html = await fetchHtml(url);
  const spell = parseSpellDetailHtml(html, url);
  if (!spell) {
    console.error(`Could not parse spell from ${url}`);
    process.exit(1);
  }
  console.log(`Parsed: ${spell.name} (${spell.school})`);
  console.log(`  Level: ${spell.levelEntries.map((e) => `${e.className} ${e.level}`).join(", ")}`);
  console.log(JSON.stringify(spell, null, 2));
}
