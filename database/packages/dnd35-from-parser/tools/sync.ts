/**
 * Re-scrapes all existing reference JSON files (keeping their overrides),
 * then regenerates all TypeScript output.
 *
 * Usage: bun run parser:sync
 *        bun run parser:sync srd              (filter by book)
 *        bun run parser:sync srd --type class  (filter by type)
 */

import { basename, join } from "node:path";

import { $ } from "bun";

import { BASE_URL, getBookSlug } from "@/database/packages/dnd35-from-parser/tools/scraper/books.ts";
import { discoverRefs, parseCliArgs } from "@/database/packages/dnd35-from-parser/tools/shared.ts";

const BASE_DIR = join(import.meta.dirname!, "../");
const GENERATOR = join(BASE_DIR, "tools/generate.ts");
const SCRAPER = join(BASE_DIR, "tools/scraper/index.ts");

/**
 * Build CLI args for the scraper.
 *
 * Constructs dndtools.net URLs from book + type + name, regardless of
 * what the stored sourceUrl says (it may point to the old dead site).
 */
function buildScrapeArgs(ref: { path: string; type: string; url?: string; book: string }): string[] | null {
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
    case "domain":
      // Domains: the book's versions on the dndtools copy's domain pages — no URL needed
      break;
    case "item":
    case "magicItem":
      // Items use hardcoded d20srd.org URLs in the scraper — no URL needed
      break;
    case "race":
      break;
    default:
      return null;
  }

  return args;
}

async function main() {
  const { bookFilter, typeFilter, nameFilter } = parseCliArgs();

  let refs = discoverRefs();
  if (refs.length === 0) {
    console.log("No reference files found.");
    return;
  }

  if (bookFilter) refs = refs.filter((r) => r.book === bookFilter);
  if (typeFilter) refs = refs.filter((r) => r.type === typeFilter);
  if (nameFilter) refs = refs.filter((r) => basename(r.path, ".json").toLowerCase() === nameFilter);

  console.log(
    `Found ${refs.length} reference files.${bookFilter || typeFilter || nameFilter ? ` (filtered: book=${bookFilter ?? "*"}, type=${typeFilter ?? "*"}, name=${nameFilter ?? "*"})` : ""}\n`,
  );

  // What failed: the sync then exits with an error, so a script running it stops
  const failed: string[] = [];

  // Phase 1: Re-scrape all refs (keeps their overrides)
  console.log("=== Scraping ===");
  for (const ref of refs) {
    const name = basename(ref.path, ".json");
    process.stdout.write(`  ${name}... `);

    const args = buildScrapeArgs(ref);
    if (!args) {
      console.log("SKIP (no URL)");
      continue;
    }

    if (await run(SCRAPER, args)) console.log("ok");
    else failed.push(name);
  }

  // Phase 2: Regenerate everything in scope, domains included
  console.log("\n=== Generating ===");
  if (!(await run(GENERATOR, process.argv.slice(2)))) failed.push("generation");

  if (failed.length > 0) {
    console.log(`\nFailed: ${failed.join(", ")}.`);
    process.exitCode = 1;
    return;
  }
  console.log(`\nDone. Synced ${refs.length} references.`);
}

/** Runs a tool (`script` with `args`), printing FAILED and its errors when it fails: whether it succeeded. */
async function run(script: string, args: string[]): Promise<boolean> {
  const result = await $`bun ${script} ${args}`.quiet().nothrow();
  if (result.exitCode === 0) return true;
  console.log("FAILED");
  console.error(result.stderr.toString());
  return false;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
