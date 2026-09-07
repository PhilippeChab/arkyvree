import { join, basename } from "node:path";
import { existsSync, readdirSync } from "node:fs";
import { $ } from "bun";
import { discoverRefs, parseCliArgs } from "@/database/packages/dnd35-from-parser/tools/shared.ts";
import { getBookSlug, BASE_URL } from "@/database/packages/dnd35-from-parser/tools/scraper/books.ts";

/**
 * Re-scrapes all existing reference JSON files (preserving mapping),
 * then regenerates all TypeScript output.
 *
 * Usage: bun run parser:sync
 *        bun run parser:sync srd              (filter by book)
 *        bun run parser:sync srd --type class  (filter by type)
 */

const BASE_DIR = join(import.meta.dirname!, "../");
const REF_DIR = join(BASE_DIR, "reference");
const SCRAPER = join(BASE_DIR, "tools/scraper/index.ts");
const GENERATOR = join(BASE_DIR, "tools/generator/index.ts");

async function main() {
  const { bookFilter, typeFilter, nameFilter } = parseCliArgs();

  let refs = discoverRefs(REF_DIR);
  if (refs.length === 0) {
    console.log("No reference files found.");
    return;
  }

  if (bookFilter) refs = refs.filter((r) => r.book === bookFilter);
  if (typeFilter) refs = refs.filter((r) => r.type === typeFilter);
  if (nameFilter) refs = refs.filter((r) => basename(r.path, ".json").toLowerCase() === nameFilter);

  // Domain refs are handled separately — they use a master reference
  const regularRefs = refs.filter((r) => r.type !== "domain");

  console.log(`Found ${refs.length} reference files.${bookFilter || typeFilter || nameFilter ? ` (filtered: book=${bookFilter ?? "*"}, type=${typeFilter ?? "*"}, name=${nameFilter ?? "*"})` : ""}\n`);

  // Phase 1: Re-scrape all regular refs (preserves mapping)
  console.log("=== Scraping ===");
  for (const ref of regularRefs) {
    const name = basename(ref.path, ".json");
    process.stdout.write(`  ${name}... `);

    const args = buildScrapeArgs(ref);
    if (!args) {
      console.log("SKIP (no URL)");
      continue;
    }

    const result = await $`bun ${SCRAPER} ${args}`.quiet().nothrow();
    if (result.exitCode !== 0) {
      console.log("FAILED");
      console.error(result.stderr.toString());
    } else {
      console.log("ok");
    }
  }

  // Phase 1b: Re-scrape master domain reference (if domains are in scope)
  if (!typeFilter || typeFilter === "domain") {
    process.stdout.write("  domains (master)... ");
    const result = await $`bun ${SCRAPER} domain`.quiet().nothrow();
    if (result.exitCode !== 0) {
      console.log("FAILED");
      console.error(result.stderr.toString());
    } else {
      console.log("ok");
    }
  }

  // Phase 2: Regenerate all regular refs
  console.log("\n=== Generating ===");
  for (const ref of regularRefs) {
    const name = basename(ref.path, ".json");
    process.stdout.write(`  ${name}... `);
    const result = await $`bun ${GENERATOR} ${ref.path}`.quiet().nothrow();
    if (result.exitCode !== 0) {
      console.log("FAILED");
      console.error(result.stderr.toString());
    } else {
      console.log("ok");
    }
  }

  // Phase 2b: Generate domains for each book that has spells
  // The generator reads the master reference and filters by available spells
  const masterDomainPath = join(REF_DIR, "domains.json");
  if (existsSync(masterDomainPath) && (!typeFilter || typeFilter === "domain")) {
    const booksWithSpells = readdirSync(REF_DIR, { withFileTypes: true })
      .filter((d) => d.isDirectory() && existsSync(join(REF_DIR, d.name, "spells.json")))
      .map((d) => d.name)
      .filter((b) => !bookFilter || b === bookFilter);

    for (const b of booksWithSpells) {
      process.stdout.write(`  domains (${b})... `);
      const result = await $`bun ${GENERATOR} ${masterDomainPath} --book ${b}`.quiet().nothrow();
      if (result.exitCode !== 0) {
        console.log("FAILED");
        console.error(result.stderr.toString());
      } else {
        console.log("ok");
      }
    }
  }

  console.log(`\nDone. Synced ${refs.length} references.`);
}

/**
 * Build CLI args for the scraper.
 *
 * Constructs dndtools.net URLs from book + type + name, regardless of
 * what the stored sourceUrl says (it may point to the old dead site).
 */
function buildScrapeArgs(ref: { path: string; type: string; url?: string; book: string; filter?: string }): string[] | null {
  const name = basename(ref.path, ".json");

  // wizardSchool has no parser — skip
  if (ref.type === "wizardSchool") return null;

  let bookSlug: string;
  try {
    bookSlug = getBookSlug(ref.book);
  } catch {
    console.warn(`Unknown book "${ref.book}" — skipping`);
    return null;
  }

  const args = [ref.type, "--book", ref.book];

  // Construct dndtools.net URL based on type
  switch (ref.type) {
    case "class": {
      // Individual class URL: /classes/{book-slug}/{class-slug}/
      // Convert camelCase filename to kebab-case for the URL
      const classSlug = name.replace(/([a-z])([A-Z])/g, "$1-$2").toLowerCase();
      const url = `${BASE_URL}/classes/${bookSlug}/${classSlug}/`;
      args.push("--url", url);
      break;
    }
    case "feat": {
      // Feats listing: /feats/{book-slug}/ — auto-discovery works
      // No --url needed, uses buildListingUrl internally
      break;
    }
    case "spell": {
      // Spells listing: /spells/{book-slug}/ — auto-discovery works
      break;
    }
    case "domain": {
      // Domains use master reference at reference/domains.json — no book needed
      return ["domain"];
    }
    case "item":
    case "magicItem":
      // Items use hardcoded d20srd.org URLs in the scraper — no URL needed
      break;
    case "race":
      break;
    default:
      return null;
  }

  if (ref.filter) {
    args.push("--filter", ref.filter);
  }

  return args;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
