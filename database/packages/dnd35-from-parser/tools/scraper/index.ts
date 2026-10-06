import { configureHttp } from "@/database/packages/dnd35-from-parser/tools/scraper/http.ts";
import { scrapeAllClasses, scrapeClass } from "@/database/packages/dnd35-from-parser/tools/scraper/scrapeClasses.ts";
import { scrapeBookDomains } from "@/database/packages/dnd35-from-parser/tools/scraper/scrapeDomains.ts";
import { scrapeAllFeats, scrapeSingleFeat } from "@/database/packages/dnd35-from-parser/tools/scraper/scrapeFeats.ts";
import { scrapeAllItems } from "@/database/packages/dnd35-from-parser/tools/scraper/scrapeItems.ts";
import { scrapeAllMagicItems } from "@/database/packages/dnd35-from-parser/tools/scraper/scrapeMagicItems.ts";
import { scrapeAllRaces, scrapeSingleRace } from "@/database/packages/dnd35-from-parser/tools/scraper/scrapeRaces.ts";
import {
  scrapeAllSpells,
  scrapeSingleSpell,
} from "@/database/packages/dnd35-from-parser/tools/scraper/scrapeSpells.ts";

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
  const args = process.argv.slice(2);

  // Parse global options
  const noCacheIdx = args.indexOf("--no-cache");
  const noCache = noCacheIdx >= 0;
  if (noCache) args.splice(noCacheIdx, 1);

  const delayIdx = args.indexOf("--delay");
  const delay = delayIdx >= 0 ? parseInt(args[delayIdx + 1], 10) : undefined;
  if (delayIdx >= 0) args.splice(delayIdx, 2);

  configureHttp({ noCache, ...(delay ? { delay } : {}) });

  if (args.length < 1) {
    printUsage();
    process.exit(1);
  }

  const type = args[0];
  const urlIdx = args.indexOf("--url");
  const url = urlIdx >= 0 ? args[urlIdx + 1] : undefined;
  const bookIdx = args.indexOf("--book");
  const book = bookIdx >= 0 ? args[bookIdx + 1] : "srd";

  if (type === "class") {
    if (url) {
      await scrapeClass(url, book);
    } else {
      await scrapeAllClasses(book);
    }
  } else if (type === "feat") {
    if (url) {
      await scrapeSingleFeat(url);
    } else {
      await scrapeAllFeats(book);
    }
  } else if (type === "spell") {
    if (url) {
      await scrapeSingleSpell(url);
    } else {
      await scrapeAllSpells(book);
    }
  } else if (type === "domain") {
    await scrapeBookDomains(book);
  } else if (type === "race") {
    if (url) {
      await scrapeSingleRace(url);
    } else {
      await scrapeAllRaces(book);
    }
  } else if (type === "item") {
    await scrapeAllItems(book);
  } else if (type === "magicItem") {
    await scrapeAllMagicItems(book);
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
