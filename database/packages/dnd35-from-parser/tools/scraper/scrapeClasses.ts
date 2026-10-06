/** Scrapes a book's classes (dndtools.net): a reference per class. */

import { join } from "node:path";

import { BASE_URL, getBookSlug } from "@/database/packages/dnd35-from-parser/tools/scraper/books.ts";
import { fetchHtml } from "@/database/packages/dnd35-from-parser/tools/scraper/http.ts";
import { discover } from "@/database/packages/dnd35-from-parser/tools/scraper/listingEntries.ts";
import { parseClassHtml } from "@/database/packages/dnd35-from-parser/tools/scraper/parsers/class/classPage.ts";
import { saveResolvedReference } from "@/database/packages/dnd35-from-parser/tools/scraper/saveReference.ts";
import { REFERENCE_DIR, toCamelCase } from "@/database/packages/dnd35-from-parser/tools/shared.ts";

export async function scrapeAllClasses(book: string) {
  // dndtools.net doesn't support /classes/{book}/ URLs — use the full listing
  // and filter by book slug in the class URL path
  const bookSlug = getBookSlug(book);
  const listingUrl = `${BASE_URL}/classes/`;
  console.log(`Discovering classes from ${listingUrl} (filtering for ${bookSlug})...`);

  const classUrls = await discover(listingUrl, "classes", bookSlug);

  console.log(`Found ${classUrls.length} classes`);

  for (const entry of classUrls) {
    console.log(`\n--- Scraping: ${entry.name} ---`);
    await scrapeClass(entry.url, book);
  }
}

export async function scrapeClass(url: string, book: string) {
  console.log(`Fetching ${url}...`);
  let html: string;
  try {
    html = await fetchHtml(url);
  } catch (err) {
    // If 404 and URL includes a book slug, try without it
    // e.g. /classes/complete-divine--52/spirit-shaman/ → /classes/spirit-shaman/
    if (err instanceof Error && err.message.includes("404")) {
      const slugMatch = url.match(/\/classes\/[^/]+\/([^/]+)\/?$/);
      if (slugMatch) {
        const fallbackUrl = `${BASE_URL}/classes/${slugMatch[1]}/`;
        console.log(`  404 — trying fallback: ${fallbackUrl}`);
        html = await fetchHtml(fallbackUrl);
        url = fallbackUrl; // Update for _meta.sourceUrl
      } else {
        throw err;
      }
    } else {
      throw err;
    }
  }
  console.log(`Parsing class HTML (${html.length} bytes)...`);

  const { _meta, ...raw } = parseClassHtml(html, url, book);

  console.log(`Detected class: ${raw.name}`);
  console.log(`  Levels: ${raw.progression.length}`);
  console.log(`  Features: ${raw.classFeatures.length}`);

  const slug = toCamelCase(raw.name);
  const outPath = join(REFERENCE_DIR, book, "classes", `${slug}.json`);

  const { detected } = saveResolvedReference(outPath, _meta, raw);
  console.log(`  BAB: ${detected.bab}`);
  console.log(`  Saves: fort=${detected.saves.fortitude} ref=${detected.saves.reflex} will=${detected.saves.will}`);
  if (detected.casterLevelAdvancement) {
    console.log(
      `  Caster advancement: ${detected.casterLevelAdvancement.type} at levels ${detected.casterLevelAdvancement.levels.join(", ")}`,
    );
  }
}
