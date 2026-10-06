/** Scrapes a book's feats (dndtools.net) into its feat reference. */

import { join } from "node:path";

import { REFERENCE_DIR } from "@/database/packages/dnd35-from-parser/tools/referenceFiles.ts";
import { buildListingUrl } from "@/database/packages/dnd35-from-parser/tools/scraper/books.ts";
import { fetchHtml } from "@/database/packages/dnd35-from-parser/tools/scraper/http.ts";
import { discover } from "@/database/packages/dnd35-from-parser/tools/scraper/listingEntries.ts";
import { parseFeatDetailHtml } from "@/database/packages/dnd35-from-parser/tools/scraper/parsers/feat.ts";
import { saveReference } from "@/database/packages/dnd35-from-parser/tools/scraper/saveReference.ts";
import { type FeatReference } from "@/database/packages/dnd35-from-parser/tools/types/feats.ts";

export async function scrapeAllFeats(book: string) {
  const listingUrl = buildListingUrl("feats", book);
  console.log(`Discovering feats from ${listingUrl}...`);

  const featUrls = await discover(listingUrl, "feats");

  console.log(`Found ${featUrls.length} feats, fetching detail pages...`);

  const raw: FeatReference["raw"] = [];
  for (const entry of featUrls) {
    const html = await fetchHtml(entry.url);
    const feat = parseFeatDetailHtml(html);
    if (feat) {
      raw.push(feat);
      console.log(`  ${feat.name} [${feat.featType}]`);
    } else {
      console.warn(`  SKIP: Could not parse ${entry.name} at ${entry.url}`);
    }
  }

  console.log(`Parsed ${raw.length} feats`);

  const outPath = join(REFERENCE_DIR, book, "feats.json");

  saveReference(
    outPath,
    {
      type: "feat",
      sourceUrl: listingUrl,
      book,
      scrapedAt: new Date().toISOString(),
    },
    raw,
  );
}

export async function scrapeSingleFeat(url: string) {
  console.log(`Fetching ${url}...`);
  const html = await fetchHtml(url);
  const feat = parseFeatDetailHtml(html);
  if (!feat) {
    console.error(`Could not parse feat from ${url}`);
    process.exit(1);
  }
  console.log(`Parsed: ${feat.name} [${feat.featType}]`);
  console.log(`  Prerequisite: ${feat.prerequisiteText || "(none)"}`);
  console.log(`  Benefit: ${feat.benefit.substring(0, 100)}...`);
  console.log(JSON.stringify(feat, null, 2));
}
