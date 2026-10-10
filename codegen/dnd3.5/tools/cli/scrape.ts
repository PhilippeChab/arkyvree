import { join } from "node:path";

import { HttpClient } from "@/codegen/core/scraper/HttpClient.ts";
import { Scraper } from "@/codegen/dnd3.5/tools/scraper/Scraper.ts";
import { sanitizeHtml } from "@/codegen/dnd3.5/tools/text/sanitize.ts";

import { CommandLine } from "./CommandLine.ts";

/** Where the scraper caches the pages it fetches: its own folder's, which git ignores. */
const SCRAPER_CACHE = join(import.meta.dirname!, "../scraper/.cache");

function printUsage() {
  console.error("Usage: bun scraper/index.ts <type> [options]");
  console.error("");
  console.error("  Types:");
  console.error("    class              Scrape class(es)");
  console.error("    feat               Scrape feat(s)");
  console.error("    spell              Scrape spell(s)");
  console.error("    domain             Scrape a book's domains (dndtools' copy at dnd.arkalseif.info)");
  console.error("    race               Scrape race(s)");
  console.error("    item               Scrape items (d20srd.org)");
  console.error("    magicItem          Scrape magic items (d20srd.org)");
  console.error("");
  console.error("  Options:");
  console.error("    --book <slug>      Source book slug (default: srd)");
  console.error("    --url <url>        Scrape a single entity by URL");
  console.error("    --no-cache         Disable disk cache");
  console.error("    --delay <ms>       Delay between requests (default: 200)");
  console.error("");
  console.error("  Examples:");
  console.error("    bun scraper/index.ts class --book srd");
  console.error("    bun scraper/index.ts class --url https://dndtools.net/classes/.../barbarian/ --book srd");
  console.error("    bun scraper/index.ts feat --book srd");
  console.error("    bun scraper/index.ts domain --book complete-divine");
  console.error("    bun scraper/index.ts spell --book srd");
  console.error("    bun scraper/index.ts race --book srd");
}

async function main() {
  let request: ReturnType<typeof CommandLine.scrape>;
  try {
    request = CommandLine.scrape();
  } catch (error) {
    // A delay that isn't a whole number, or an option the scraper doesn't take
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
  const { type, book, url, noCache, delay } = request;
  if (!type) {
    printUsage();
    process.exit(1);
  }

  const client = new HttpClient({
    cacheDir: SCRAPER_CACHE,
    noCache,
    sanitize: sanitizeHtml,
    ...(delay !== undefined ? { delay } : {}),
  });
  const scraper = new Scraper(book, client);

  if (type === "class") {
    if (url) await scraper.scrapeClass(url);
    else await scraper.scrapeClasses();
  } else if (type === "feat") {
    if (url) await scraper.scrapeFeat(url);
    else await scraper.scrapeFeats();
  } else if (type === "spell") {
    if (url) await scraper.scrapeSpell(url);
    else await scraper.scrapeSpells();
  } else if (type === "domain") {
    await scraper.scrapeDomains();
  } else if (type === "race") {
    if (url) await scraper.scrapeRace(url);
    else await scraper.scrapeRaces();
  } else if (type === "item") {
    await scraper.scrapeItems();
  } else if (type === "magicItem") {
    await scraper.scrapeMagicItems();
  } else if (type === "wizardSchool") {
    console.log(`Skipping wizardSchool — no HTML parser (reference is manually maintained)`);
  } else {
    console.error(`Unknown type: ${type}. Supported: class, feat, spell, domain, race, item, magicItem, wizardSchool`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
