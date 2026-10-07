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

import References from "@/database/packages/dnd35-from-parser/tools/references/References.ts";
import type { ReferenceFile } from "@/database/packages/dnd35-from-parser/tools/types/reference.ts";

import { parseCliArgs } from "./args.ts";

const GENERATOR = join(import.meta.dirname!, "generate.ts");
const SCRAPER = join(import.meta.dirname!, "scrape.ts");

/**
 * The scraper's arguments to re-scrape a reference: its type and book, and a class's page, the URL its reference
 * stores. None for a reference the scraper doesn't scrape (the wizard schools).
 */
function buildScrapeArgs(ref: ReferenceFile): string[] | null {
  // wizardSchool has no parser — skip
  if (ref.type === "wizardSchool") return null;

  const args = [ref.type, "--book", ref.book];
  // A class is scraped from its page, the one its reference was scraped from; the other kinds from their listings
  // (feats, spells, races), the domains' pages or the SRD's equipment pages, which the scraper finds
  if (ref.type === "class") {
    if (!ref.url) return null;
    args.push("--url", ref.url);
  }
  return args;
}

async function main() {
  const { bookFilter, typeFilter, nameFilter } = parseCliArgs();

  const allRefs = References.files();
  if (allRefs.length === 0) {
    console.log("No reference files found.");
    return;
  }

  const refs = References.files({ bookFilter, typeFilter, nameFilter });

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
